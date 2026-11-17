// Social posts for the team admin (/admin/social): what is scheduled and published on Bookingbooster's own
// Facebook, Instagram, TikTok and YouTube through Metricool.
// Where the posts come from, best first:
//   1. Metricool's API, when METRICOOL_TOKEN, METRICOOL_USER_ID and METRICOOL_BLOG_ID are set (cached for 10 minutes).
//   2. A copy saved in the kv table under social:snapshot (the same shape as social-snapshot.json).
//   3. social-snapshot.json, the copy taken from Metricool when this page was built.
'use strict';
const FILE = require('./social-snapshot.json');

module.exports = function ({ db }) {
  const kvGet = db.prepare('SELECT v FROM kv WHERE k = ?');
  const env = process.env, live = () => env.METRICOOL_TOKEN && env.METRICOOL_USER_ID && env.METRICOOL_BLOG_ID;
  let cache = null;

  // Metricool's post shape, trimmed to what the page shows (and without who created it)
  const trim = p => {
    const media = p.media || [], kind = ((p.instagramData || {}).type || (p.facebookData || {}).type || 'POST').toLowerCase();
    return { id: p.id, at: (p.publicationDate || {}).dateTime || '', text: p.text || '', kind, draft: !!p.draft, thumb: p.videoThumbnailUrl || media[0] || '', media: media.length,
      video: media.some(m => /\.mp4($|\?)/.test(m)), title: (p.youtubeData || {}).title || (p.tiktokData || {}).title || '',
      nets: (p.providers || []).map(x => [x.network, String(x.status || '').toLowerCase(), x.publicUrl || '']) };
  };

  async function fromApi(now) {
    const day = ms => new Date(ms).toISOString().slice(0, 19);
    const q = new URLSearchParams({ blogId: env.METRICOOL_BLOG_ID, userId: env.METRICOOL_USER_ID, start: day(now - 35 * 864e5), end: day(now + 70 * 864e5), timezone: env.METRICOOL_TIMEZONE || 'Europe/London' });
    const r = await fetch((env.METRICOOL_API || 'https://app.metricool.com/api') + '/v2/scheduler/posts?' + q, { headers: { 'X-Mc-Auth': env.METRICOOL_TOKEN, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('Metricool ' + r.status);
    const j = await r.json(), list = Array.isArray(j) ? j : j.data || [];
    return { source: 'Metricool, live', as_of: new Date(now).toISOString(), posts: list.map(trim).sort((a, b) => a.at.localeCompare(b.at)) };
  }

  async function posts() {
    const now = Date.now();
    if (live()) {
      if (cache && now - cache.at < 10 * 6e4) return cache.data;
      try { const data = await fromApi(now); cache = { at: now, data }; return data; } catch (e) { console.warn('metricool: ' + e.message); }
    }
    const row = await kvGet.get('social:snapshot');
    if (row) { try { const s = JSON.parse(row.v); if (Array.isArray(s.posts) && (!FILE.as_of || String(s.as_of) > FILE.as_of)) return Object.assign({ source: 'Metricool, saved copy' }, s); } catch (_) {} }
    return Object.assign({}, FILE, { source: 'Metricool, saved copy' });
  }

  return { posts, live: () => !!live() };
};
