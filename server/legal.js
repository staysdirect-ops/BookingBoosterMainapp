// Privacy notice and terms, written from what the app actually does. Drafts: have them reviewed before launch.
'use strict';

module.exports = function (cfg, E) {
  const c = cfg.company, co = E(c.name), mail = '<a href="mailto:' + E(c.support) + '">' + E(c.support) + '</a>';
  const reg = (c.number ? 'Company number ' + E(c.number) + '. ' : '') + 'Registered office: ' + E(c.address) + '.';
  const sec = (h, ...ps) => '<h2 style="font-size:20px;margin:28px 0 8px">' + h + '</h2>' + ps.map(p => Array.isArray(p) ? '<ul style="color:var(--mut);padding-left:20px;margin:0 0 18px">' + p.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '<p>' + p + '</p>').join('');
  const draft = cfg.legalReviewed ? '<p><small>Last updated ' + E(cfg.legalReviewed) + '.</small></p>' : '<p class="card"><b>Draft.</b> This needs review by a solicitor before launch.</p>';

  const privacy = '<h1>Privacy notice</h1><p>How ' + co + ' uses personal data. ' + reg + '</p>' +
    sec('Who is responsible',
      'For hosts\' own accounts, and for people who fill in our forms, we are the controller.',
      'For guests who book a host\'s home, the host is the controller and we process guest data on the host\'s behalf, to run their booking site, payments, check-in and messages. Questions about a stay are best sent to the host. We will pass on any request we receive.') +
    sec('What we collect',
      [
        '<b>Hosts:</b> name, business name, email, password (stored only as a salted hash), plan and billing status, the homes and details you add, photos you upload, and the tokens you paste in to connect smart locks (stored encrypted).',
        '<b>Guests:</b> name, email, phone, dates, party size, payments and refunds, messages with the host, check-in answers and signature, an ID photo if the host asks for one, ratings and reviews.',
        '<b>People who fill in our forms:</b> email, name and the answers you give, the page you came from and campaign tags in the link.',
        '<b>Visitors to booking sites:</b> a daily count of visits per site and whether the visit came from a search engine or AI assistant. We do not store IP addresses or set tracking cookies.',
      ]) +
    sec('Why we use it, and the legal basis',
      [
        'To run a host\'s account and the bookings on it: to perform our contract with the host, and the host\'s contract with their guest.',
        'To send booking emails and texts: the same.',
        'To send a host\'s marketing emails to their guest list: only guests who agreed, and anyone can unsubscribe in one click. The host is responsible for that consent.',
        'To send the emails our forms promise, such as a guide, audit or live demo details: our legitimate interest in answering your request. Every email has an unsubscribe link, and we stop when you use it or open an account.',
        'To keep the service secure and to keep records the law requires: legitimate interests and legal obligations.',
      ]) +
    sec('Who we share it with',
      'Only the providers we need to run the service, each under a contract that limits what they can do with the data:',
      [
        'Stripe, for card payments, deposits, payouts and our own subscriptions.',
        'Resend or Postmark, for email, and Twilio, for texts.',
        'Nuki, when a host connects smart locks, to create door codes for each stay.',
        'Anthropic, when a host asks for a suggested reply to a guest message. The message and the home\'s details are sent; the host reviews every reply before it goes.',
        'OpenAI, Google, Perplexity and SerpApi, for AI visibility checks. These receive traveller questions such as "dog friendly cottage in Whitby", never guest data.',
        'Our hosting provider, which stores the database and files.',
        'Google Fonts, which serves the fonts on our pages and sees your IP address when it does.',
      ],
      'We do not sell personal data. Some of these providers are outside the UK; where they are, we rely on UK adequacy regulations or the UK International Data Transfer Agreement.') +
    sec('How long we keep it',
      [
        'ID photos: deleted 30 days after checkout, or when the booking is cancelled.',
        'Host accounts: until the host deletes the account, which removes it straight away. Daily backups are kept for 14 days and then overwritten.',
        'Guest records: for as long as the host keeps their account, unless the host deletes them sooner.',
        'Form answers: until you unsubscribe or ask us to delete them, and we review them at least once a year.',
      ]) +
    sec('Your rights',
      'You can ask for a copy of your data, ask us to correct or delete it, object to how we use it or ask us to limit it, and ask for it in a portable format. Hosts can download all their data and delete their account from the account page. To do any of this, email ' + mail + '. We reply within one month.',
      'If you are unhappy with how we handle your data, you can complain to the Information Commissioner\'s Office at <a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>.') +
    sec('Cookies',
      'We set two cookies, both strictly necessary, so we do not ask before setting them: <code>bb_s</code> keeps hosts signed in, and <code>bb_demo</code> keeps your own copy of the demo for 7 days if you try it. Booking sites and our marketing pages set no cookies. The host app can keep an offline copy of the console on a host\'s phone; signing out clears it.') +
    sec('Changes', 'We will update this notice when what we do changes, and tell hosts by email about anything significant.') +
    draft;

  const terms = '<h1>Terms of service</h1><p>These terms are between you, the host, and ' + co + ' (“we”). ' + reg + '</p>' +
    sec('The service',
      'Bookingbooster gives you booking websites for your holiday lets, a host console and phone app, a guest app for check-in, payments through your own Stripe account, guest emails and campaigns, and AI visibility checks.',
      'Bookingbooster is not a channel manager. The only sync is the optional calendar sync add-on, which reads calendar links (iCal) from your channel manager, Airbnb, Vrbo or Booking.com to block dates. It moves dates only. Those sites can be slow to update their own calendar links, so you remain responsible for avoiding double bookings.') +
    sec('Plans and payment',
      'Bookingbooster costs a one-off setup fee of £997. Your first month is free, then it is £200 a month. The calendar sync add-on is £15 a month. All prices include VAT. There is no minimum term.',
      'The setup fee is taken when you start your plan, and the plan is first billed a month later. The setup fee is not refundable once we have started building your site.',
      'We take payment monthly in advance through Stripe. If a payment fails, we will email you and may pause your account until it is paid. We will give you at least 30 days\' notice of any price change.',
      'You can cancel at any time from your console. Your plan runs to the end of the month you have paid for. We do not refund part periods, except where the law says we must.') +
    sec('Your bookings and your guests',
      [
        'Bookings made on your sites are contracts between you and your guest. We are not a party to them.',
        'Guests pay you directly through Stripe Connect, under Stripe\'s terms. Refunds, deposits and disputes are between you and your guest, through Stripe.',
        'You are responsible for your listings being accurate, for your house rules and cancellation terms, and for any licences, safety certificates, insurance and taxes your lets need.',
        'You are the controller of your guests\' data. You must have the right to import any guest list, and only email guests who agreed to hear from you.',
      ]) +
    sec('Acceptable use',
      'Do not use Bookingbooster to list homes you do not have the right to let, to publish fake or copied reviews, to send messages people did not agree to, or to break the law. We may suspend accounts that do, and will tell you why.') +
    sec('Your content',
      'You keep ownership of your photos, words and guest list. You give us permission to host and show them to run your sites. You can download your data at any time, and your domain stays yours.') +
    sec('Our responsibility to you',
      'We aim to keep the service available and your data safe, and we take daily backups. We are not responsible for losses caused by things outside our control, including outages at Stripe, email and text providers, smart lock makers or the sites you sync calendars with.',
      'Our total liability to you in any 12 months is limited to the fees you paid us in that time. Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else the law does not allow us to limit.') +
    sec('Ending the agreement',
      'You can delete your account at any time from the account page. We can end the agreement with 30 days\' notice, or straight away if you seriously break these terms. Download your data first; deletion is permanent.') +
    sec('Schedule: how we process your guests\' data',
      'This schedule is the data processing agreement that UK GDPR Article 28 requires between you (the controller) and us (the processor) for your guests\' personal data.',
      [
        '<b>What and why:</b> guests\' names, contact details, stay dates, payments, messages, check-in answers, ID photos and reviews, processed only to run your booking sites, payments, check-in, messages and campaigns, for as long as you use Bookingbooster.',
        '<b>Your instructions:</b> we process this data only as these terms and your use of the console direct, unless the law requires otherwise, in which case we will tell you first if the law allows.',
        '<b>Confidentiality and security:</b> only people who need access to run the service have it, under a duty of confidence. Data is sent over HTTPS, passwords are hashed, stored credentials are encrypted, ID photos are deleted 30 days after checkout, and we keep daily backups.',
        '<b>Sub-processors:</b> you agree to the providers listed in our <a href="/privacy">privacy notice</a>. We will give you at least 30 days\' notice by email before adding or replacing one, so you can object or leave.',
        '<b>Helping you:</b> we will help you answer guests\' requests to see, correct or delete their data, and with security and data protection impact questions about the service.',
        '<b>Breaches:</b> we will tell you without undue delay, and within 48 hours of becoming aware of a breach that affects your guests\' data, with what we know.',
        '<b>At the end:</b> when you delete your account we delete your guests\' data straight away. It leaves our backups within 14 days. You can download it first.',
        '<b>Checks:</b> we will give you the information you reasonably need to show we keep to this schedule, and answer reasonable audit questions in writing.',
      ]) +
    sec('Law', 'These terms are governed by the law of England and Wales, and the courts of England and Wales can hear any dispute. Questions? Email ' + mail + '.') +
    draft;

  return { privacy, terms };
};
