// Stripe over its REST API (no SDK). Hosts connect their own Stripe account (Connect Express), guests pay the
// host directly through Stripe Checkout, and hosts pay for their Bookingbooster plan with a subscription.
'use strict';
const crypto = require('crypto');

module.exports = function (cfg) {
  // Read each time: on Supabase the key can also be saved from the team page (kept encrypted in the database).
  const keyOf = () => cfg.stripe.key;
  function form(obj, prefix, out) {
    out = out || [];
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v === null) continue;
      const name = prefix ? prefix + '[' + k + ']' : k;
      if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'object' ? form(x, name + '[' + i + ']', out) : out.push([name + '[' + i + ']', String(x)]));
      else if (typeof v === 'object') form(v, name, out);
      else out.push([name, String(v)]);
    }
    return out;
  }
  async function api(method, path, params, opts) {
    if (!keyOf()) throw new Error('Stripe is not set up on this server.');
    const headers = { authorization: 'Bearer ' + keyOf() };
    if (opts && opts.account) headers['Stripe-Account'] = opts.account;
    if (opts && opts.idem) headers['Idempotency-Key'] = opts.idem;
    let url = (cfg.stripe.apiBase || 'https://api.stripe.com') + '/v1' + path, body;
    if (params && method === 'GET') url += '?' + new URLSearchParams(form(params));
    else if (params) { body = new URLSearchParams(form(params)); headers['content-type'] = 'application/x-www-form-urlencoded'; }
    const r = await fetch(url, { method, headers, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || 'Stripe error ' + r.status); e.stripe = j.error; throw e; }
    return j;
  }
  const pence = n => Math.round(Number(n) * 100);

  // What the platform keeps from a guest payment: any commission (STRIPE_APPLICATION_FEE_PCT, normally 0) plus
  // Stripe's card fee passed through at cost, which Stripe takes from the platform on destination charges.
  function appFee(amountPence) {
    const S = cfg.stripe, commission = S.feePct ? Math.round(amountPence * S.feePct / 100) : 0;
    const card = S.passFees ? Math.round(amountPence * S.cardFeePct / 100) + S.cardFeePence : 0;
    const fee = Math.min(amountPence, commission + card); return fee > 0 ? fee : undefined;
  }
  return {
    get enabled() { return !!keyOf(); }, api,
    async connect({ email, business, accountId, returnUrl, refreshUrl }) {
      const acct = accountId || (await api('POST', '/accounts', { type: 'express', country: 'GB', email, business_profile: { name: business, mcc: '7011', product_description: 'Holiday let bookings' }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } })).id;
      const link = await api('POST', '/account_links', { account: acct, refresh_url: refreshUrl, return_url: returnUrl, type: 'account_onboarding' });
      return { account: acct, url: link.url };
    },
    async account(id) { const a = await api('GET', '/accounts/' + id); return { id: a.id, charges: !!a.charges_enabled, payouts: !!a.payouts_enabled, details: !!a.details_submitted, bank: a.external_accounts && a.external_accounts.data && a.external_accounts.data[0] ? (a.external_accounts.data[0].bank_name || 'Bank') + ' ••' + a.external_accounts.data[0].last4 : null }; },
    async checkoutBooking({ account, booking, property, email, successUrl, cancelUrl, meta }) {
      const fee = appFee(pence(booking.total));
      const s = await api('POST', '/checkout/sessions', {
        mode: 'payment', customer_email: email, success_url: successUrl, cancel_url: cancelUrl, expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: pence(booking.total), product_data: { name: property.name + ', ' + booking.checkIn + ' to ' + booking.checkOut, description: 'Direct booking ' + booking.id } } }],
        payment_intent_data: { on_behalf_of: account, transfer_data: { destination: account }, application_fee_amount: fee, metadata: meta, description: property.name + ' booking ' + booking.id },
        metadata: meta,
      }, { idem: 'bk-' + meta.workspace + '-' + booking.id });
      return { id: s.id, url: s.url };
    },
    async checkoutCharge({ account, name, amount, email, successUrl, cancelUrl, meta }) {
      const s = await api('POST', '/checkout/sessions', { mode: 'payment', customer_email: email, success_url: successUrl, cancel_url: cancelUrl,
        line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: pence(amount), product_data: { name } } }],
        payment_intent_data: { on_behalf_of: account, transfer_data: { destination: account }, application_fee_amount: appFee(pence(amount)), metadata: meta }, metadata: meta });
      return { id: s.id, url: s.url };
    },
    // Damage deposit: the card is saved (not charged) so the host can charge up to the deposit if something is broken.
    async checkoutDeposit({ email, successUrl, cancelUrl, meta }) {
      const s = await api('POST', '/checkout/sessions', { mode: 'setup', currency: 'gbp', customer_creation: 'always', customer_email: email, success_url: successUrl, cancel_url: cancelUrl, setup_intent_data: { metadata: meta, description: 'Damage deposit card on file' }, metadata: meta });
      return { id: s.id, url: s.url };
    },
    async refund(paymentIntent, amount) { return api('POST', '/refunds', { payment_intent: paymentIntent, amount: amount ? pence(amount) : undefined, reverse_transfer: true, refund_application_fee: !cfg.stripe.passFees }); }, // Stripe keeps its card fee on a refund, so the pass-through stays too
    appFee,
    // The add-on price this account should pay: All channels (£29) replaces the calendar sync add-on (£15), never both.
    addonPrice({ addon, tier, annual }) { const P = cfg.stripe.prices; if (!addon) return null; return tier === 'all' ? (annual ? P.allChannelsAnnual : P.allChannels) : (annual ? P.addonAnnual : P.addon); },
    // Keeps a running subscription in step when the host adds, changes or drops the add-on from their console.
    // Prorated, so they pay for the days they use. Returns what changed.
    async syncAddon(customer, want) {
      const P = cfg.stripe.prices; const ours = [P.addon, P.addonAnnual, P.allChannels, P.allChannelsAnnual].filter(Boolean);
      const list = await api('GET', '/subscriptions', { customer, status: 'active', limit: 10 });
      const sub = (list.data || [])[0]; if (!sub) return { changed: false, reason: 'no subscription' };
      const items = (sub.items && sub.items.data) || []; const have = items.filter(it => it.price && ours.includes(it.price.id || it.price));
      const pid = it => it.price.id || it.price;
      if (want && have.length === 1 && pid(have[0]) === want) return { changed: false };
      if (want && !have.some(it => pid(it) === want)) await api('POST', '/subscription_items', { subscription: sub.id, price: want, quantity: 1, proration_behavior: 'create_prorations' });
      for (const it of have) if (pid(it) !== want) await api('DELETE', '/subscription_items/' + it.id, { proration_behavior: 'create_prorations' });
      return { changed: true };
    },
    async subscribe({ customer, customerEmail, plan, addon, tier, annual, successUrl, cancelUrl, meta }) {
      // Annual billing (2 months free) uses the yearly prices; the add-on then bills yearly too, at 12 × £15.
      // No setup fee and no free month: the first month (or year) is paid at checkout, before the host sets anything up.
      const P = cfg.stripe.prices, yearly = annual && P[plan + 'Annual'];
      const price = yearly ? P[plan + 'Annual'] : P[plan]; if (!price) throw new Error('No Stripe price is set for the ' + plan + ' plan.');
      const add = tier === 'all' ? (yearly ? P.allChannelsAnnual : P.allChannels) || (yearly ? P.addonAnnual : P.addon) : yearly ? P.addonAnnual : P.addon;
      const items = [{ price, quantity: 1 }]; if (addon && add) items.push({ price: add, quantity: 1 });
      const s = await api('POST', '/checkout/sessions', { mode: 'subscription', customer: customer || undefined, customer_email: customer ? undefined : customerEmail, line_items: items, success_url: successUrl, cancel_url: cancelUrl, subscription_data: { metadata: meta }, metadata: meta, allow_promotion_codes: true });
      return { id: s.id, url: s.url };
    },
    // AI credit top-up: a one-off card payment to Bookingbooster (not to the host's own Stripe account).
    async checkoutCredit({ customer, email, pounds, successUrl, cancelUrl, meta }) {
      const s = await api('POST', '/checkout/sessions', { mode: 'payment', customer: customer || undefined, customer_email: customer ? undefined : email, success_url: successUrl, cancel_url: cancelUrl,
        line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: pence(pounds), tax_behavior: 'inclusive', product_data: { name: 'Bookingbooster AI credit top-up', description: '£' + pounds + ' of AI credit for the site builder, funnels and reply drafts. Never expires.', tax_code: 'txcd_10103001' } } }],
        payment_intent_data: { metadata: meta, description: 'AI credit top-up £' + pounds }, invoice_creation: { enabled: true }, metadata: meta });
      return { id: s.id, url: s.url };
    },
    // Account deletion: end every live subscription for this customer straight away.
    async cancelSubscriptions(customer) {
      const list = await api('GET', '/subscriptions', { customer, status: 'all', limit: 100 });
      for (const sub of list.data || []) if (!['canceled', 'incomplete_expired'].includes(sub.status)) await api('DELETE', '/subscriptions/' + sub.id);
    },
    // Damage: charge the card the guest saved at check-in (on our account), paid out to the host's account like a booking.
    async chargeDamage({ setupIntent, account, amount, description, meta, idem }) {
      const si = await api('GET', '/setup_intents/' + setupIntent);
      const pm = si.payment_method && (si.payment_method.id || si.payment_method), customer = si.customer && (si.customer.id || si.customer);
      if (!pm || !customer) throw new Error('The guest’s card was not saved, so it cannot be charged.');
      const p = pence(amount), fee = this.appFee ? this.appFee(p) : (cfg.stripe.feePct ? Math.round(p * cfg.stripe.feePct / 100) : undefined);
      return api('POST', '/payment_intents', { amount: p, currency: 'gbp', customer, payment_method: pm, off_session: true, confirm: true, description,
        on_behalf_of: account, transfer_data: { destination: account }, application_fee_amount: fee, metadata: meta }, { idem });
    },
    async portal(customer, returnUrl) { const s = await api('POST', '/billing_portal/sessions', { customer, return_url: returnUrl }); return s.url; },
    verify(payload, header) {
      // Two endpoints point here: the platform one, and the Connect one that carries hosts' account.updated events.
      const secrets = [cfg.stripe.webhookSecret, cfg.stripe.connectWebhookSecret].filter(Boolean); if (!secrets.length || !header) return false;
      const parts = Object.fromEntries(String(header).split(',').map(x => x.split('=')));
      const t = parts.t; if (!t || Math.abs(Date.now() / 1000 - +t) > 600) return false;
      return secrets.some(secret => {
        const want = crypto.createHmac('sha256', secret).update(t + '.' + payload).digest('hex');
        return String(header).split(',').filter(x => x.startsWith('v1=')).some(x => { const v = x.slice(3); return v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(want)); });
      });
    },
  };
};
