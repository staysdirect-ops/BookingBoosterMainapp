// AI visibility checks: asks the real answer engines (ChatGPT, Gemini, Perplexity, Claude, Google) the questions travellers ask and records whether the host's
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
    // Claude (Anthropic) with its web search tool, the same way claude.ai answers a traveller who asks.
    claude: A.anthropic && (async q => {
      const j = await post((A.anthropicBase || 'https://api.anthropic.com') + '/v1/messages', { 'x-api-key': A.anthropic, 'anthropic-version': '2023-06-01' },
        { model: A.anthropicModel, max_tokens: 4000, tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'GB' } }], messages: [{ role: 'user', content: ask.replace('{q}', q) }] });
      if (j.stop_reason === 'refusal') return { text: '', urls: [] };
      const blocks = j.content || [];
      const text = blocks.filter(c => c.type === 'text').map(c => c.text || '').join('');
      // Cited sources first, then everything the search returned.
      const cited = blocks.filter(c => c.type === 'text').flatMap(c => c.citations || []).map(c => c.url);
      const found = blocks.filter(c => c.type === 'web_search_tool_result' && Array.isArray(c.content)).flatMap(c => c.content).map(r => r.url);
      return { text, urls: [...new Set(cited.concat(found).filter(Boolean))] };
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
  // The sites an answer cites, as bare domains. Gemini gives redirect links with the site's domain as the title.
  function domains(urls) {
    const out = [];
    (urls || []).forEach(u => { const parts = String(u).split(' '); let d = ''; try { d = new URL(parts[0]).hostname; } catch (_) {}
      if ((!d || /vertexaisearch|googleusercontent|google\.com$/.test(d)) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parts[1] || '')) d = parts[1];
      d = d.toLowerCase().replace(/^www\./, ''); if (d && !out.includes(d)) out.push(d); });
    return out.slice(0, 8);
  }
  // Linked, not just named: one of the cited sources is the home's own site.
  const linked = (res, props) => { const ds = domains(res.urls); return props.some(p => p.domain && ds.some(d => String(p.domain).toLowerCase().replace(/^www\./, '').startsWith(d))); };
  // questions: [{q, propertyId}], props: the workspace's homes. Returns [{i, engines:{k: bool}, cited:{k: bool}, sources:{k: [domain]}, answers}]
  async function check(questions, props) {
    const keys = available(); if (!keys.length) return { results: [], keys };
    const results = [];
    for (let i = 0; i < questions.length; i++) {
      const qn = questions[i], focus = props.filter(p => p.id === qn.propertyId);
      const out = { i, engines: {}, answers: {}, cited: {}, sources: {} };
      await Promise.all(keys.map(async k => {
        try { const r = await engines[k](qn.q); out.engines[k] = mentions(r, focus.length ? focus : props); out.cited[k] = linked(r, focus.length ? focus : props); out.sources[k] = domains(r.urls); out.answers[k] = String(r.text || '').slice(0, 600); }
        catch (e) { out.answers[k] = 'Check failed: ' + String(e.message).slice(0, 120); }
      }));
      results.push(out);
    }
    return { results, keys };
  }
  return { check, available, domains };
};
