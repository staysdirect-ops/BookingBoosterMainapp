// ManyChat (Instagram, Facebook Messenger and WhatsApp DMs) into the leads list.
// A ManyChat "External Request" action posts the email it collected here, with the guide the person asked for.
// We save the lead, start the guide follow-up emails, and answer with the guide's link so the DM can show it too.
// Setup steps and the flows themselves: docs/manychat/README.md
'use strict';
const crypto = require('node:crypto');

// The free guides. key = what ManyChat sends (also the DM keyword, in capitals), file = web/guides/<file>
const GUIDES = {
  playbook: { file: 'direct-booking-playbook.pdf', title: 'The Direct Booking Playbook' },
  leak: { file: 'fee-leak-worksheet.pdf', title: 'Fee Leak Worksheet' },
  templates: { file: 'guest-message-template-pack.pdf', title: 'Guest Message Template Pack' },
  audit: { file: 'ai-search-self-audit.pdf', title: 'AI Search Self-Audit' },
  aiguide: { file: 'get-found-in-ai-search.pdf', title: 'Get Recommended by AI' },
  checklist: { file: 'direct-booking-launch-checklist.pdf', title: '7-Day Direct Booking Launch Checklist' },
  website: { file: 'direct-booking-website-must-haves.pdf', title: 'Direct Booking Website Scorecard' },
  repeat: { file: 'repeat-guest-engine.pdf', title: 'The Repeat Guest Engine' },
  swipe: { file: 'repeat-guest-swipe-file.pdf', title: 'Repeat Guest Swipe File' },
};
const CHANNELS = ['instagram', 'facebook', 'messenger', 'whatsapp', 'tiktok'];
const yes = v => v === true || /^(1|y|yes|true|on|ok|sure)$/i.test(String(v == null ? '' : v).trim());

module.exports = function ({ cfg }) {
  // ManyChat sends the shared secret in a header we choose in the request settings: X-BB-Key
  function allowed(req) {
    const want = String(cfg.manychat.secret || ''), got = String(req.headers['x-bb-key'] || '');
    if (want.length < 16 || got.length !== want.length) return false;
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  }
  // Turns ManyChat's body into what /api/leads stores. Returns { error } or { lead, guide }.
  function parse(d) {
    const email = String(d.email || '').trim().slice(0, 160);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid email.' };
    const key = String(d.guide || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    const guide = GUIDES[key] ? Object.assign({ key, url: cfg.baseUrl + '/guides/' + GUIDES[key].file }, GUIDES[key]) : null;
    const channel = CHANNELS.includes(String(d.channel || '').toLowerCase()) ? String(d.channel).toLowerCase() : 'dm';
    const data = { page: 'manychat-' + channel, channel, consent: yes(d.consent) ? 'yes' : 'no' };
    if (guide) { data.sequence = 'guide'; data.guide = guide.key; }
    ['topic', 'homes', 'town', 'subscriber_id', 'instagram', 'phone'].forEach(k => { if (d[k] != null && String(d[k]).trim()) data[k] = String(d[k]).trim().slice(0, 300); });
    return { lead: { email, name: String(d.name || '').trim().slice(0, 120), kind: guide ? 'manychat-guide' : 'manychat-' + (data.topic ? 'sales' : 'contact'), data }, guide };
  }
  return { GUIDES, allowed, parse, enabled: () => String(cfg.manychat.secret || '').length >= 16 };
};
module.exports.GUIDES = GUIDES;
