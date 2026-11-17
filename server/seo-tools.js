// Search tools for host sites that call out to real services:
//  - write(): drafts an answer-first summary, a local area guide, FAQ answers or a Google title and description with Claude,
//    from the home's own facts only. The host always reviews and saves the draft. Needs ANTHROPIC_API_KEY.
//  - ping(): tells IndexNow (Bing, Yandex, Seznam, Naver) that a page changed, so it is recrawled within hours.
//    No account or API key needed: the key is served from the host's own site.
'use strict';
module.exports = function (cfg) {
  const enabled = !!cfg.ai.anthropic;
  const money = n => '£' + Number(n || 0).toLocaleString('en-GB');
  function facts(s, p) {
    const faqs = ((s.website.faqs || {})[p.id] || []).map(x => 'FAQ: ' + x.replace('|', ' — '));
    return [
      'Home: ' + p.name, 'Area: ' + (p.area || ''), 'Type: ' + ({ cabin: 'cabin', lake: 'cottage', city: 'apartment' }[p.theme] || 'holiday let'),
      'Sleeps ' + p.maxGuests + ', ' + p.bedrooms + ' bedrooms, ' + p.baths + ' bathrooms', 'From ' + money(p.nightly) + ' a night' + (p.weekend ? ' (+' + money(p.weekend) + ' Friday and Saturday)' : '') + ', cleaning ' + money(p.cleaning),
      'Minimum stay: ' + p.minNights + ' nights', 'Check-in from ' + p.checkinTime + ', checkout by ' + p.checkoutTime, 'Dogs: ' + (p.petsAllowed ? 'welcome' + (p.petFee ? ' (' + money(p.petFee) + ' per stay)' : '') : 'not allowed'),
      p.headline ? 'Headline: ' + p.headline : null, p.about ? 'About: ' + p.about : null, (p.amenities || []).length ? 'Amenities: ' + p.amenities.join(', ') : null,
      (p.rules || []).length ? 'House rules: ' + p.rules.join(' ') : null, p.parking ? 'Parking: ' + p.parking : null,
      (p.guide || []).length ? 'Nearby (place | distance | host tip): ' + p.guide.join('; ') : null,
      p.rating && p.reviews ? 'Guest rating: ' + p.rating + ' from ' + p.reviews + ' reviews' : null, ...faqs,
    ].filter(Boolean).join('\n');
  }
  const ASK = {
    summary: ['Write an answer-first summary of this holiday let for the top of its booking page and for AI assistants to quote. 40 to 60 words, one paragraph. Say what it is, where, who it sleeps, the price from, and the one or two best features. Plain, factual, no superlatives like "stunning" or "nestled".', 300],
    area: ['Write a local area guide for this holiday let\'s booking page, for searches like "things to do near <town>". 150 to 250 words in 3 short paragraphs: walks and outdoors, food and pubs, days out. Use only places from the facts; where the facts list none for a paragraph, write generally about the area without naming businesses. UK English.', 900],
    meta: ['Write a Google title (at most 60 characters) and meta description (120 to 155 characters) for this holiday let\'s booking page. Include the type of home and the town, and in the description the price from and "book direct". Reply as two lines: "Title: ..." then "Description: ...".', 200],
    faqs: ['Answer each question below for this holiday let\'s FAQ, one or two sentences each, starting with the direct answer (Yes, No, or the fact). If the facts do not answer a question, reply with exactly "ASK HOST" for it. Reply as lines "Q: ..." then "A: ...".', 900],
  };
  async function write(s, p, what, onUsage, questions) {
    if (!enabled || !ASK[what]) return null;
    const system = 'You write website copy for a UK holiday let host (' + s.account.business + '). Use UK English. Only state facts from the list provided. Never invent prices, amenities, distances, awards or business names. No emoji. Reply with the text only.';
    const user = 'Facts:\n' + facts(s, p) + '\n\n' + ASK[what][0] + (what === 'faqs' ? '\n\nQuestions:\n' + (questions || []).slice(0, 10).map(q => '- ' + String(q).slice(0, 200)).join('\n') : '');
    const r = await fetch((cfg.ai.anthropicBase || 'https://api.anthropic.com') + '/v1/messages', { method: 'POST', signal: AbortSignal.timeout(45000),
      headers: { 'x-api-key': cfg.ai.anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.ai.anthropicModel, max_tokens: ASK[what][1] + 200, system, messages: [{ role: 'user', content: user }] }) });
    if (!r.ok) throw new Error('Claude answered ' + r.status);
    const j = await r.json(); if (onUsage) await onUsage(j.model || cfg.ai.anthropicModel, j.usage);
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    if (what === 'meta') { const t = (text.match(/Title:\s*(.+)/i) || [])[1], d = (text.match(/Description:\s*(.+)/i) || [])[1]; return t && d ? { title: t.trim().slice(0, 70), description: d.trim().slice(0, 170) } : null; }
    if (what === 'faqs') {
      const out = []; let q = null;
      text.split('\n').forEach(l => { const mq = l.match(/^\s*Q:\s*(.+)/i), ma = l.match(/^\s*A:\s*(.+)/i); if (mq) q = mq[1].trim(); else if (ma && q) { const a = ma[1].trim(); out.push({ q, a: /^ASK HOST/i.test(a) ? '' : a.slice(0, 600), needs: /^ASK HOST/i.test(a) }); q = null; } });
      return out;
    }
    return text.slice(0, what === 'area' ? 4000 : 600) || null;
  }
  // urls must all be on the same host as keyLocation. Returns { ok, status, message }.
  async function ping(host, key, keyLocation, urls) {
    if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host) || /^(localhost|127\.|10\.|192\.168\.)/.test(host)) return { ok: false, status: 0, message: 'Search engines cannot reach a local test address.' };
    try {
      const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host, key, keyLocation, urlList: urls.slice(0, 100) }) });
      const msg = { 200: 'Accepted. Bing and the other IndexNow engines will recrawl soon.', 202: 'Received. Bing is checking the key file, then recrawls.', 400: 'IndexNow said the request was invalid.', 403: 'IndexNow could not find the key file on the site yet.', 422: 'IndexNow says these pages do not belong to the key.', 429: 'Too many requests. Try again tomorrow.' }[r.status] || 'IndexNow answered ' + r.status + '.';
      return { ok: r.status === 200 || r.status === 202, status: r.status, message: msg };
    } catch (e) { return { ok: false, status: 0, message: 'Could not reach IndexNow: ' + e.message }; }
  }
  return { enabled, write, ping, facts };
};
