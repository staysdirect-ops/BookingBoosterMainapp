// Stripe over its REST API (no SDK). Hosts connect their own Stripe account (Connect Express), guests pay the
// host directly through Stripe Checkout, and hosts pay for their Bookingbooster plan with a subscription.
'use strict';
const crypto = require('crypto');

module.exports = function (cfg) {
  const key = cfg.stripe.key;
  const enabled = !!key;
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
    if (!enabled) throw new Error('Stripe is not set up on this server.');
    const headers = { authorization: 'Bearer ' + key };
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

  return {
    enabled, api,
    async connect({ email, business, accountId, returnUrl, refreshUrl }) {
      const acct = accountId || (await api('POST', '/accounts', { type: 'express', country: 'GB', email, business_profile: { name: business, mcc: '7011', product_description: 'Holiday let bookings' }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } })).id;
      const link = await api('POST', '/account_links', { account: acct, refresh_url: refreshUrl, return_url: returnUrl, type: 'account_onboarding' });
      return { account: acct, url: link.url };
    },
    async account(id) { const a = await api('GET', '/accounts/' + id); return { id: a.id, charges: !!a.charges_enabled, payouts: !!a.payouts_enabled, details: !!a.details_submitted, bank: a.external_accounts && a.external_accounts.data && a.external_accounts.data[0] ? (a.external_accounts.data[0].bank_name || 'Bank') + ' ••' + a.external_accounts.data[0].last4 : null }; },
    async checkoutBooking({ account, booking, property, email, successUrl, cancelUrl, meta }) {
      const fee = cfg.stripe.feePct ? Math.round(pence(booking.total) * cfg.stripe.feePct / 100) : undefined;
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
        payment_intent_data: { on_behalf_of: account, transfer_data: { destination: account }, metadata: meta }, metadata: meta });
      return { id: s.id, url: s.url };
    },
    // Damage deposit: the card is saved (not charged) so the host can charge up to the deposit if something is broken.
    async checkoutDeposit({ email, successUrl, cancelUrl, meta }) {
      const s = await api('POST', '/checkout/sessions', { mode: 'setup', currency: 'gbp', customer_creation: 'always', customer_email: email, success_url: successUrl, cancel_url: cancelUrl, setup_intent_data: { metadata: meta, description: 'Damage deposit card on file' }, metadata: meta });
      return { id: s.id, url: s.url };
    },
    async refund(paymentIntent, amount) { return api('POST', '/refunds', { payment_intent: paymentIntent, amount: amount ? pence(amount) : undefined, reverse_transfer: true, refund_application_fee: true }); },
    async subscribe({ customerEmail, plan, addon, annual, successUrl, cancelUrl, meta }) {
      // Annual billing (2 months free) uses the yearly prices; the add-on then bills yearly too, at 12 × £15.
      // The one-off setup fee is charged at checkout; the first month is free, so the plan's first charge comes a month later.
      const P = cfg.stripe.prices, yearly = annual && P[plan + 'Annual'];
      const price = yearly ? P[plan + 'Annual'] : P[plan]; if (!price) throw new Error('No Stripe price is set for the ' + plan + ' plan.');
      const add = yearly ? P.addonAnnual : P.addon;
      const items = [{ price, quantity: 1 }]; if (addon && add) items.push({ price: add, quantity: 1 }); if (P.setup) items.push({ price: P.setup, quantity: 1 });
      const s = await api('POST', '/checkout/sessions', { mode: 'subscription', customer_email: customerEmail, line_items: items, success_url: successUrl, cancel_url: cancelUrl, subscription_data: { trial_period_days: 30, metadata: meta }, metadata: meta, allow_promotion_codes: true });
      return { id: s.id, url: s.url };
    },
    // Account deletion: end every live subscription for this customer straight away.
    async cancelSubscriptions(customer) {
      const list = await api('GET', '/subscriptions', { customer, status: 'all', limit: 100 });
      for (const sub of list.data || []) if (!['canceled', 'incomplete_expired'].includes(sub.status)) await api('DELETE', '/subscriptions/' + sub.id);
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
