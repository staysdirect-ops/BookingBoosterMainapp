# ManyChat flows: build steps and copy

Build these in ManyChat > Automation. Text in quotes is the exact message. **[Button]** is a button or quick reply, and the arrow says where it goes. Keep the copy as written: prices, claims and wording match the website. Lead with direct bookings. Listing homes on Airbnb and other sites is the optional All channels add-on, never the main offer, and we do not manage platform messages or reviews.

Buttons in Instagram DMs: at most 3 under a message, quick replies up to 13. Text messages up to 1,000 characters.

Links (all with `?utm_source=instagram&utm_medium=dm&utm_campaign=manychat`, swap `instagram` for `facebook` in the Messenger copies):
- Sign up: `https://booking-booster.co.uk/start?plan=Growth` (or the `{{bb_signup_url}}` field once S1 has run)
- Live demo: `https://booking-booster.co.uk/demo`
- Pricing: `https://booking-booster.co.uk/pricing`
- Book a call: the `book_call_url` you set in `/admin` > Settings

---

## S1. Send to Bookingbooster (shared, no trigger)

Every flow that collects an email ends here.
1. Condition: Email **is not empty**. If empty, go to step 2. If set, go to step 4.
2. User Input, reply type **Email**: "What is the best email for you? We will send it there too." Save to system field **Email**. Retry message: "That does not look like an email. Try again, for example name@yourstays.co.uk". Skip button text: "Skip".
3. If skipped: send "No problem. Here is the link instead." and the guide's static link (table in G0), then stop.
4. Action: External Request (setup in README step 4).
5. Condition: `bb_guide` is not empty.
   - Yes: send "Done. Your copy is below and in your inbox." Card with **[Download the guide]** > URL `{{bb_guide_url}}`. Then wait 1 minute and send "While you read: want to see what your own booking site would look like?" **[Try the live demo]** > Live demo URL, **[Pricing]** > M2.
   - No: "Thanks. A person from the team will reply here soon, usually within one working day." Notify admins (Action > Notify Admins, text "ManyChat sales lead: {{full_name}}, {{email}}, topic {{bb_topic}}, homes {{bb_homes}}").
6. If the External Request fails (ManyChat's failure branch): send the static guide link from G0 so the person still gets it, and notify admins "ManyChat could not reach the server for {{email}}".

---

## G. Free guides

### G0. The 9 guides

| Keyword | `bb_guide` value | Guide | Static link (fallback) |
|---|---|---|---|
| PLAYBOOK | playbook | The Direct Booking Playbook | `/guides/direct-booking-playbook.pdf` |
| LEAK | leak | Fee Leak Worksheet | `/guides/fee-leak-worksheet.pdf` |
| TEMPLATES | templates | Guest Message Template Pack | `/guides/guest-message-template-pack.pdf` |
| AUDIT | audit | AI Search Self-Audit | `/guides/ai-search-self-audit.pdf` |
| AIGUIDE | aiguide | Get Recommended by AI | `/guides/get-found-in-ai-search.pdf` |
| CHECKLIST | checklist | 7-Day Direct Booking Launch Checklist | `/guides/direct-booking-launch-checklist.pdf` |
| WEBSITE | website | Direct Booking Website Scorecard | `/guides/direct-booking-website-must-haves.pdf` |
| REPEAT | repeat | The Repeat Guest Engine | `/guides/repeat-guest-engine.pdf` |
| SWIPE | swipe | Repeat Guest Swipe File | `/guides/repeat-guest-swipe-file.pdf` |

Static links start `https://booking-booster.co.uk`.

### G1. One guide flow per keyword (build PLAYBOOK, then duplicate 8 times)

Triggers (add all three to the same flow):
- Instagram > **Comments** on any post (or chosen posts), keyword **PLAYBOOK**, "contains". Public reply to the comment (turn on, add 3 versions so it does not look like a bot): "Sent you a DM", "Check your DMs", "On its way to your inbox".
- Instagram > **DM keyword** PLAYBOOK.
- Instagram > **Story reply** keyword PLAYBOOK.
- Messenger copy: Messenger > Keyword PLAYBOOK, and Facebook > Comments on Page posts.

Steps:
1. Action: set `bb_guide` = `playbook`, add tag `guide-requested`.
2. Message: "Here is the Direct Booking Playbook: the 4 things that move bookings direct, for UK holiday let hosts. Tap below and I will send it over." **[Send it]** > step 3. (Instagram needs this tap before we can send links after a comment.)
3. Message: "Want 3 short emails with tips on getting more direct bookings this week? One-click unsubscribe, any time." Quick replies **[Yes, send tips]** > set `bb_consent` = `yes`, **[Just the guide]** > set `bb_consent` = `no`. Both > S1.

For each copy, change the keyword, `bb_guide` value and the line in step 2:

| Keyword | Step 2 line |
|---|---|
| LEAK | "Here is the Fee Leak Worksheet: 5 minutes with last year's payout report and you will see what platform fees really cost you." |
| TEMPLATES | "Here is the Guest Message Template Pack: 8 messages from booking to come-back offer, each with an email and a text version." |
| AUDIT | "Here is the AI Search Self-Audit: 20 minutes to see if ChatGPT, Gemini and Google's AI know your place exists." |
| AIGUIDE | "Here is Get Recommended by AI: how hosts show up in ChatGPT, Google and AI search, with local pages, reviews and FAQs." |
| CHECKLIST | "Here is the 7-Day Launch Checklist: launch your direct booking site in a week, one day at a time." |
| WEBSITE | "Here is the Direct Booking Website Scorecard: does your site have the 20 must-haves?" |
| REPEAT | "Here is the Repeat Guest Engine: consent-first email and text plays that bring past guests back direct." |
| SWIPE | "Here is the Repeat Guest Swipe File: 12 ready-to-send campaigns that bring guests back direct." |

### G2. "Free guides" menu (no keyword needed)

Trigger: DM keywords **GUIDE, GUIDES, FREE, FREEBIE**, and the main menu button.
Message: "We have 9 free guides for hosts. Which one?" Quick replies:
**[Cut platform fees]** > LEAK flow · **[The full playbook]** > PLAYBOOK flow · **[Show up in AI search]** > AUDIT flow · **[Bring guests back]** > REPEAT flow · **[Guest messages]** > TEMPLATES flow · **[Launch a site]** > CHECKLIST flow · **[More]** > second message with **[Website scorecard]** > WEBSITE, **[AI search guide]** > AIGUIDE, **[Swipe file]** > SWIPE.

---

## M. Main menu and default reply

### M1. Main menu
Triggers: Default Reply (anything that matches no keyword, at most once every 24 hours), Welcome Message (first DM), DM keywords **MENU, HI, HELLO, HELP, INFO**.

Message: "Hi {{first_name}}, this is Bookingbooster. We help UK holiday let hosts get more direct bookings: your own booking site, found on Google and in AI answers, with card payments and emails that bring guests back. What would you like to know?"
Quick replies:
**[Pricing]** > M2 · **[What's included]** > Q1 · **[Do I leave Airbnb?]** > Q2 · **[AI search]** > Q3 · **[How setup works]** > Q4 · **[Free guides]** > G2 · **[Book a call]** > C1 · **[Talk to a person]** > C3

### M2. Pricing
Triggers: DM keywords **PRICE, PRICING, COST, HOW MUCH**, the menu button.
Message: "It is £197 a month, including VAT. No setup fee, no commission on your bookings, no contract. Cancel from your console any time, and your domain and guest list stay yours."
Wait 2 seconds. Message: "Most hosts cover it fast: at Airbnb's 15.5% host fee, about £1,270 a month of bookings moved direct pays for the plan. That is an estimate, and the Fee Leak Worksheet works out your own number."
Buttons: **[Start now]** > Sign-up URL · **[Get the worksheet]** > LEAK flow · **[It feels like a lot]** > O1

### Q1. What's included
Triggers: DM keywords **INCLUDED, FEATURES, WHAT DO I GET, WHAT IS IT**, the menu button.
Message: "Everything you need to take bookings direct, set up for you:
- Your own booking website on your own domain
- Card, Apple Pay and Google Pay through Stripe, paid into your UK bank
- Security deposits held on the guest's card, released after checkout
- Guest check-in on their phone, with the door code on arrival day
- New local SEO pages every month, so you show up on Google
- AI visibility checks every week, and fixes for the gaps
- Guest email and text campaigns, written and sent for you"
Buttons: **[See the live demo]** > Live demo URL · **[Pricing]** > M2 · **[How setup works]** > Q4

### Q2. Airbnb and platform fees
Triggers: DM keywords **AIRBNB, FEES, FEE, VRBO, BOOKING.COM, COMMISSION, LEAVE**, the menu button.
Message: "You do not have to leave Airbnb. Keep your listings for finding new guests. We grow your direct bookings, so the second stay and the Google search come to you without the 15% fee."
Wait 2 seconds. Message: "If you want to stay on the platforms, the optional All channels add-on lists your homes on Airbnb, Booking.com, Vrbo and 70+ more sites from one calendar, with open dates kept in step everywhere, so you never double book. It is £15 a month, or £29 with nightly prices and minimum stays sent to every site too."
Buttons: **[What is my fee leak?]** > LEAK flow · **[Pricing]** > M2 · **[Back to menu]** > M1

### Q3. AI search (AEO) and Google (SEO)
Triggers: DM keywords **AI, CHATGPT, GEMINI, PERPLEXITY, SEO, AEO, GOOGLE**, the menu button.
Message: "More travellers now ask ChatGPT, Gemini, Perplexity or Google's AI where to stay. AI visibility is how often your holiday let shows up in those answers. Every week we check the questions guests ask about your area and fix the gaps, and every month we add new local pages so you show up on Google too."
Buttons: **[Free self-audit]** > AUDIT flow · **[What's included]** > Q1 · **[Book a call]** > C1
(ChatGPT, Gemini, Perplexity and Google are trademarks of their owners. Bookingbooster is not affiliated with them. Keep this line in the pinned FAQ post.)

### Q4. Setup
Triggers: DM keywords **SETUP, SET UP, HOW LONG, START, GET STARTED, SIGN UP**, the menu button.
Message: "Paste your listing link and your site is live the same day on a free address. We then connect your own .co.uk domain, write your SEO pages and import your guest list, which takes about a week. You do not need to be techy: we do the setup for you."
Buttons: **[Start now]** > Sign-up URL · **[Book a call first]** > C1 · **[Launch checklist]** > CHECKLIST flow

### Q5. Smaller questions (keyword > one message, then **[Back to menu]** > M1)

| Keywords | Message |
|---|---|
| PAY, PAYMENT, STRIPE, DEPOSIT | "Guests pay by card, Apple Pay or Google Pay through Stripe, straight into your UK bank account. Security deposits are card holds that release on their own after checkout." |
| GUESTS, GDPR, DATA, LIST | "Your guest list is yours. Every guest who books direct, and every past guest you import, can be exported any time. We handle their data under UK GDPR, and emails to past guests follow the consent rules." |
| VAT | "Yes, all our prices include VAT. £197 a month, no setup fee." |
| CANCEL, CONTRACT | "No contract. Cancel from your console any time. Your domain stays yours." |
| HOMES, PROPERTIES, PORTFOLIO | "Tell me how many homes you run and a person will reply with what fits." > set `bb_homes` from the reply (User Input, text), set `bb_topic` = `homes`, > S1 |
| DEMO | "Here is the live demo: a real booking site and host console with sample data. booking-booster.co.uk/demo" |

---

## O. Objections

Each one: tag the objection, answer once, offer one next step. Never argue twice. If they push back again, offer a person (C3).

### O1. "It is too expensive" (tag `objection-price`)
Triggers: DM keywords **EXPENSIVE, TOO MUCH, CHEAPER, AFFORD**, the M2 button.
Message: "Fair question. Put it next to what the platform takes: at a 15.5% host fee, a £1,000 booking costs you £155. The plan is £197 a month with no commission, so a handful of direct bookings a month covers it, and every one after that is yours. No contract either, so if it does not pay its way, you cancel."
Buttons: **[Work out my fees]** > LEAK flow · **[Talk it through]** > C1

### O2. "I already have a website" (tag `objection-website`)
Triggers: DM keywords **HAVE A WEBSITE, ALREADY HAVE, MY OWN SITE, WIX, SQUARESPACE, WORDPRESS**.
Message: "Good start. The question is whether it brings in bookings on its own. A site needs three things around it: Google pages for the searches guests make, answers AI assistants can quote, and emails to past guests. Our free scorecard checks your site against 20 must-haves in a few minutes."
Buttons: **[Score my site]** > WEBSITE flow · **[Book a call]** > C1

### O3. "Airbnb works fine for me" (tag `objection-airbnb`)
Triggers: DM keywords **HAPPY WITH AIRBNB, AIRBNB IS FINE, DON'T NEED, DONT NEED**.
Message: "Keep it. Airbnb is good at finding first-time guests. We are for the guests you have already won: the second booking, the friend they recommend, the Google search for your village. Those can come to you direct, with no fee on either side."
Buttons: **[Bring guests back]** > REPEAT flow · **[Pricing]** > M2

### O4. "I have no time / I am not techy" (tag `objection-time`)
Triggers: DM keywords **NO TIME, BUSY, NOT TECHY, NOT TECHNICAL, COMPLICATED**.
Message: "That is who we built it for. We set it up for you: paste your listing link and the site is live the same day. After that we write the SEO pages and the guest campaigns each month. Your part is answering guests, which you do already."
Buttons: **[Start now]** > Sign-up URL · **[Book a 15-minute call]** > C1

### O5. "Does it work in my area?"
Triggers: DM keywords **MY AREA, WHERE, CORNWALL, LAKES, LAKE DISTRICT, COTSWOLDS, SCOTLAND, WALES, LONDON, EDINBURGH**.
Message: "We work with holiday lets and short lets across the UK. What matters is what guests search for near you, so the free AI Search Self-Audit is a good first look: it shows whether ChatGPT and Google's AI know your place exists."
Buttons: **[Free self-audit]** > AUDIT flow · **[Book a call]** > C1

### O6. "Is this legit? / Who are you?"
Triggers: DM keywords **SCAM, LEGIT, REAL, REVIEWS, WHO ARE YOU**.
Message: "Fair to ask. Bookingbooster is a UK company. You can try the full product in the live demo before you pay anything, payments go through Stripe, and there is no contract. A person on the team is happy to talk it through."
Buttons: **[Try the live demo]** > Live demo URL · **[Talk to a person]** > C3
(Do not add customer quotes or results here until they are real and the customer has agreed.)

---

## C. Calls, sign-up and people

### C1. Book a call (tag `wants-call`, `hot-lead`)
Triggers: DM keywords **CALL, DEMO CALL, CHAT, SPEAK, BOOK**, every **[Book a call]** button.
1. Message: "A 15-minute call with the team: we look at your listing and show you what your direct booking site would look like. How many homes do you run?" Quick replies **[1]**, **[2 to 3]**, **[4 or more]** > set `bb_homes`.
2. Set `bb_topic` = `book-call`, run S1 (collects email, saves the lead, notifies the team).
3. Message: "Pick a time that suits you here:" **[Choose a time]** > your `book_call_url`.

### C2. Ready to sign up (tag `hot-lead`)
Triggers: DM keywords **SIGN ME UP, I'M IN, IM IN, LET'S GO, BUY**.
Message: "Great. Sign-up takes about 5 minutes: paste your listing link and your site is live the same day. £197 a month, no setup fee, cancel any time." **[Start now]** > Sign-up URL
Wait 24 hours, condition: not tagged `customer` (add that tag by hand when they appear in `/admin` accounts). Message: "Did sign-up go OK? If anything got in the way, reply here and a person will help." Only send this follow-up inside Meta's 24-hour window (ManyChat warns you if it is outside).

### C3. Talk to a person (tag `human-needed`)
Triggers: DM keywords **HUMAN, PERSON, AGENT, SOMEONE, REAL PERSON**, every **[Talk to a person]** button.
1. Action: pause automation for this contact for 24 hours (Pause Automations), Notify Admins: "{{full_name}} wants a person in DMs. Last message: {{last_input_text}}".
2. Condition on time (Mon to Fri, 9:00 to 17:30 London).
   - In hours: "Thanks. A person from the team will reply here shortly."
   - Out of hours: "Thanks. The team is back at 9am on the next working day and will reply here. In the meantime, the live demo shows everything: booking-booster.co.uk/demo"

---

## Posts that drive the keywords (free traffic)

Pin these to the Instagram grid and add a "Free guides" story highlight.

- Pinned post 1: "9 free guides for UK holiday let hosts. Comment the word and we will DM it to you. LEAK: what platform fees cost you. PLAYBOOK: the full direct booking plan. AUDIT: does ChatGPT know your place exists? REPEAT: bring past guests back direct."
- Pinned post 2 (FAQ): "Questions we get every day. DM us PRICE, AIRBNB, AI or SETUP and you will get the answer straight away."
- Every carousel or reel about a topic ends with one keyword: "Comment TEMPLATES and I will send you all 8 messages."
- Bio line: "Free host guides: DM GUIDE"
