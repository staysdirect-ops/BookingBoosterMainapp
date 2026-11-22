// Outreach email sequences for imported leads (server/lead-import.js), by source tag.
//
// BOTH SEQUENCES ARE INACTIVE DRAFTS. `active: false` below means the engine will not enrol anyone in them and will
// not send a single step, whatever else is set. Switching one on is a reviewed code change: set `active: true` here,
// merge and deploy. (Test servers can switch them on with OUTREACH_TEST_ON, which only works with ALLOW_TEST_CLOCK=1.)
//
// Copy is stored exactly as approved, with merge fields in curly brackets. At send time every field must have a value,
// or the step is held back rather than sent with a gap. Each email gets the sender line, {company_footer} and a
// one-click unsubscribe link added under the copy.
//   {first_name} {property_name} {town} {brand} {link} {sender_name} {company_footer}
'use strict';

const SENDER = 'Faster Software Group trading as Booking Booster';

const series = {
  // Sequence A: scraped UK hosts, 4 emails
  'outreach-a': {
    name: 'Outreach A: scraped UK hosts',
    active: false,
    sources: ['scraped'],
    steps: [
      { key: 'A1', day: 1, subject: '{property_name}: bookings without the commission', body: `Hi {first_name},

I came across {property_name} and wanted to ask one question. When a guest books with you through a platform, how much of that booking do you actually keep?

Booking Booster builds and runs a direct booking website for your holiday let, on your own domain. Guests see live availability, book instantly and pay you directly by card. We take no commission on any booking.

It is £200 a month including VAT, with no setup fee and no contract.

Would it be worth a look? You can see how it works here: {link}

{sender_name}
Booking Booster` },
      { key: 'A2', day: 4, subject: 'What the £200 a month covers', body: `Hi {first_name},

A fair question about any monthly fee is what you get for it. For Booking Booster it is this:

- Your own booking website on your own domain, with live availability, instant booking, card payments and security deposit holds.
- Local pages published every month so the site can be found on Google.
- A guest check-in app with door codes, plus emails and texts to bring past guests back.
- One plan covers up to 3 homes.

You can cancel at any time, and you keep your domain and your guest list if you leave.

Have a look here: {link}

{sender_name}` },
      { key: 'A3', day: 9, subject: 'Can a guest find {property_name} without a platform?', body: `Hi {first_name},

Try searching for a holiday let in {town} on Google, or asking ChatGPT for one. The question is whether {property_name} shows up by itself, or only inside someone else's listing site.

Booking Booster sites are set up for both. We publish local search pages each month, and each site is structured so that AI tools such as ChatGPT, Gemini and Perplexity can read it and recommend it. Every home also gets a search health score, so you can see what is working.

The guests who find you that way book with you directly and pay you directly.

Details are here: {link}

{sender_name}` },
      { key: 'A4', day: 15, subject: 'Shall I close this off?', body: `Hi {first_name},

I have written a few times about a direct booking site for {property_name}, and I don't want to keep filling your inbox.

If the timing is wrong, no problem at all, and this is my last email. If you would like to see it, the page is here: {link}. It is £200 a month, or £2,000 if paid yearly, which works out as two months free.

Either way, I wish you a full calendar.

{sender_name}` },
    ],
  },

  // Sequence B: Stays Direct and Contractor Stop hosts, 3 emails. {brand} follows the lead's source tag.
  'outreach-b': {
    name: 'Outreach B: Stays Direct and Contractor Stop hosts',
    active: false,
    sources: ['stays-direct', 'contractor-stop'],
    steps: [
      { key: 'B1', day: 1, subject: 'A booking site of your own, {first_name}', body: `Hi {first_name},

You know us from {brand}, where {property_name} is listed. I am writing because we have built something for hosts like you and I wanted you to hear about it from us first.

It is called Booking Booster. It gives your property its own booking website, on your own domain, where guests see live availability, book instantly and pay you directly by card. There is no commission on any booking.

Nothing changes with your {brand} listing. This sits alongside it, so the guests who look for you directly have somewhere to book.

It is £200 a month including VAT, with no setup fee and no contract. Have a look: {link}

{sender_name}` },
      { key: 'B2', day: 5, subject: 'Your guests, your list', body: `Hi {first_name},

The part of this I would want to know as a host is who owns the relationship with the guest. With Booking Booster, you do.

With a Booking Booster site, every guest who books is on your own guest list. The site sends them check-in details and door codes, and follows up by email and text so they come back to you next time. If you ever leave, you keep the domain and you can export the whole list.

One plan covers up to 3 properties. Details are here: {link}

{sender_name}` },
      { key: 'B3', day: 10, subject: 'Last note on this', body: `Hi {first_name},

This is my last email about Booking Booster, so I will keep it short.

Your own booking site, no commission, guests pay you directly. £200 a month, or £2,000 if paid yearly, which works out as two months free. Cancel any time.

If you want it, start here: {link}. If you have a question first, just reply to this email and I will answer it myself.

{sender_name}` },
    ],
  },
};

const BRANDS = { 'stays-direct': 'Stays Direct', 'contractor-stop': 'Contractor Stop' };
const forSource = source => Object.keys(series).find(k => series[k].sources.includes(source)) || null;

module.exports = { series, SENDER, BRANDS, forSource };
