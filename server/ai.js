// AI visibility checks: asks the real answer engines the questions travellers ask and records whether the host's
// homes are named or linked. Each engine runs only when its API key is set; the rest are left as they were.
'use strict';

module.exports = function (cfg) {
  const A = cfg.ai;
  const ask = 'A traveller in the UK asks: "{q}". Recommend specific places to stay, by name, with a link to book each one. Keep it short.';
  async function post(url, headers, body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
    try { const r = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(body), signal: ctl.signal }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + r.status); return j; }
    finally { clearTimeout(t); }
  }
  const engines = {
    chatgpt: A.openai && (async q => {
      const j = await post('https://api.openai.com/v1/responses', { authorization: 'Bearer ' + A.openai }, { model: A.openaiModel, tools: [{ type: 'web_search_preview', user_location: { type: 'approximate', country: 'GB' } }], input: ask.replace('{q}', q) });
      const text = (j.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('\n');
      const urls = (j.output || []).flatMap(o => o.content || []).flatMap(c => c.annotations || []).map(a => a.url).filter(Boolean);
      return { text, urls };
    }),
    gemini: A.gemini && (async q => {
      const j = await post('https://generativelanguage.googleapis.com/v1beta/models/' + A.geminiModel + ':generateContent?key=' + encodeURIComponent(A.gemini), {}, { contents: [{ parts: [{ text: ask.replace('{q}', q) }] }], tools: [{ google_search: {} }] });
      const c = (j.candidates || [])[0] || {}; const text = ((c.content || {}).parts || []).map(p => p.text || '').join('\n');
      const urls = (((c.groundingMetadata || {}).groundingChunks) || []).map(g => g.web && (g.web.uri + ' ' + (g.web.title || ''))).filter(Boolean);
      return { text, urls };
    }),
    perplexity: A.perplexity && (async q => {
      const j = await post('https://api.perplexity.ai/chat/completions', { authorization: 'Bearer ' + A.perplexity }, { model: A.perplexityModel, messages: [{ role: 'user', content: ask.replace('{q}', q) }] });
      return { text: ((j.choices || [])[0] || {}).message ? j.choices[0].message.content : '', urls: j.citations || (j.search_results || []).map(r => r.url) };
    }),
    // Google: the regular results page plus any AI Overview, through SerpAPI.
    google: A.serpapi && (async q => {
      const r = await fetch('https://serpapi.com/search.json?' + new URLSearchParams({ engine: 'google', q, gl: 'uk', hl: 'en', google_domain: 'google.co.uk', api_key: A.serpapi }));
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'SerpAPI ' + r.status);
      const org = (j.organic_results || []).slice(0, 10);
      const ov = j.ai_overview ? JSON.stringify(j.ai_overview) : '';
      return { text: org.map(o => o.title + ' ' + o.snippet).join('\n') + '\n' + ov, urls: org.map(o => o.link) };
    }),
  };
  const available = () => Object.keys(engines).filter(k => engines[k]);
  function mentions(res, props) {
    const hay = (res.text + ' ' + (res.urls || []).join(' ')).toLowerCase();
    return props.some(p => [p.name, p.domain, p.short && p.short.length > 6 ? p.short : null].filter(Boolean).some(n => hay.includes(String(n).toLowerCase())));
  }
  // questions: [{q, propertyId}], props: the workspace's homes. Returns [{i, engines:{k: bool}, answers}]
  async function check(questions, props) {
    const keys = available(); if (!keys.length) return { results: [], keys };
    const results = [];
    for (let i = 0; i < questions.length; i++) {
      const qn = questions[i], focus = props.filter(p => p.id === qn.propertyId);
      const out = { i, engines: {}, answers: {} };
      await Promise.all(keys.map(async k => {
        try { const r = await engines[k](qn.q); out.engines[k] = mentions(r, focus.length ? focus : props); out.answers[k] = String(r.text || '').slice(0, 600); }
        catch (e) { out.answers[k] = 'Check failed: ' + String(e.message).slice(0, 120); }
      }));
      results.push(out);
    }
    return { results, keys };
  }
  return { check, available };
};
