# Bookingbooster

Direct booking websites, a guest app, payments, guest marketing and AI visibility for UK holiday let hosts.

Bookingbooster is not a channel manager. The only sync is an optional calendar sync (the £15 a month add-on) with the host's channel manager, Airbnb, Vrbo or Booking.com, so dates booked there are blocked on the host's own sites and nobody double books.

## Run it

Needs Node 22.13 or newer. There are no packages to install.

```
cp .env.example .env     # optional: every outside service can stay blank
npm start                # http://localhost:8080
npm test                 # end-to-end tests against a real server
```

With nothing in `.env` the server runs in test mode. Emails and texts are saved in the `outbox` table instead of being sent, and booking sites take booking requests instead of card payments.

| Address | What it is |
| --- | --- |
| `/` and `/pricing` | Marketing site and sign-up (the onboarding flow creates a real account) |
| `/demo` | The full demo with sample data. Each visitor gets their own copy that never touches the outside world |
| `/app` and `/app/phone` | The host console and phone view (sign in at `/login`) |
| `/s/<account>/<home>` | A home's booking site. With `SITES_DOMAIN` set, homes also get `<home>.<SITES_DOMAIN>`. A host's own domain works once its DNS records are proved (see below) |
| `/trip/<account>/<booking>?k=…` | The guest app for one stay (signed link) |
| `/ical/…/<token>.ics` | Each home's calendar feed for Airbnb, Vrbo or a channel manager to read |
| `/app/account` | The host's details, password, data download (JSON and guest list CSV) and account deletion |
| `/admin` | Team only (`ADMIN_EMAILS` or `config:admins`): overview, leads and their follow-up emails, email campaigns, host accounts and AI credit, Stripe, live demo links and backups. Same look as the host console (`server/admin-shell.js` uses the console's stylesheet) |
| `/admin/campaigns` | Team only: email campaigns to leads and hosts (write, test, send or schedule, opens and clicks) |
| `/admin/hosts` | Team only: Users. Every host account with billing, sites, bookings and AI credit, a search box, billing filters and a CSV download. `/admin/hosts/<id>` shows one account in full: account and Stripe details, sites, latest bookings, emails sent, AI use, who can sign in. From there the team can send a password reset or add AI credit (`server/admin-users.js`) |
| `/admin/campaigns/write` | Team only: write a marketing email on one page, send yourself a test, then send or schedule it. Every admin page has a "Write an email" button |
| `/admin/emails` | Team only: every email the system sends (lead follow-ups, designed campaigns, host onboarding and reports, guest booking emails), rendered by the code that sends it with sample details (`server/admin-content.js`) |
| `/admin/social` | Team only: Bookingbooster's own social posts from Metricool, as a month calendar and a list (coming up, published, failed). Live when `METRICOOL_TOKEN`, `METRICOOL_USER_ID` and `METRICOOL_BLOG_ID` are set; otherwise the copy in kv `social:snapshot` or `server/social-snapshot.json` (`server/social.js`) |
| `/guides/<name>.pdf` | The free guides that the lead forms promise |

## What works in a real account

- **Accounts.** Sign-up, sign-in with a password or an emailed link and 6-digit code (single use, 15 minutes, five wrong codes void it; `server/signin.js`), password reset by branded email, sessions in secure cookies, one workspace per host.
- **Booking sites.** Each home gets a site rendered on the server so search engines and AI assistants can read it: VacationRental and FAQPage structured data, `robots.txt` that welcomes AI crawlers, `sitemap.xml` and `llms.txt`. Hosts upload their own photos and write the guest details, area guide and house rules in Website & SEO. Nothing is made up for them.
- **Bookings.** With Stripe connected, guests pay through Stripe Checkout and the money goes straight to the host's Stripe account (Connect, destination charges). The dates are held for 30 minutes while they pay. Without Stripe, the site takes a booking request that the host accepts or declines. Accepting sends the guest a payment link once Stripe is connected.
- **Bank transfer and invoices.** In Payments, hosts can add their bank details (account name, sort code and account number, or IBAN and BIC) and turn on bank transfer. Guests can then choose "Book and pay by bank transfer" at checkout, alongside card payment or instead of a booking request. The stay is booked and the dates are held, and the guest gets an invoice by email (with a printable invoice page on their trip link) that shows the bank details, the amount, the due date (the host's number of days, never later than the day before arrival) and the booking reference. The booking confirmation email and the door code are held back until the host presses "Bank transfer received". Hosts can also email an invoice for any unpaid direct booking, for example a phone booking or an accepted request. Booking sites only learn that bank transfer is on; the bank details only go to a guest who chose it. Unpaid invoices are not cancelled automatically: overdue ones show in the booking and in Waiting for payment, and the host decides.
- **Site builder.** In Get found → Site builder, Claude acts as the art director for each home's booking site. The host picks a feel (or an art direction) and says who the guests are. Claude reads the home's details and photos, chooses one of 14 art directions, lays out the page from a library of section layouts (35 in all, including eight hero layouts) and writes every word. It also picks style overrides (font pairing, palette, corners, buttons, spacing, headline size and case, texture, top bar, photo treatment and section colours) and is told which looks the host's other homes already use, so no two sites come out the same. It returns a design spec, never raw HTML, and the server renders it from the Studio design system (`server/studio/`): 17 curated Google Font pairings, 19 palettes all checked for WCAG contrast in the tests, seven one-click page templates (Classic, Magazine, Photo showcase, Minimal, Bold, Boutique, Cosy), fluid type, film grain, quiet scroll reveals and a built-in booking calendar. Each design is checked against 12 design rules (contrast, headline length, banned AI clichés, pace, alt text, Google title length and more) and sent back to Claude once if it fails. Prices, photos, reviews, amenities and the area guide always come from the home's real data, so nothing is invented. Hosts can switch direction, page template, hero and section layouts, fonts, palette, accent colour (colours that fail contrast are refused) and every style switch, press Shuffle for a fresh coherent mix (no AI needed), edit every word with live character counts and a Google result preview, reorder sections, ask Claude for changes in plain English, undo, preview on desktop and phone, then publish. Published designs keep the same structured data, sitemap and booking flow (card, request or bank transfer); switching off goes back to the standard site. Without `ANTHROPIC_API_KEY` the same design system lays out the site by rules, and still varies the template, hero and style per home so homes on one account look different. The model is `ANTHROPIC_STUDIO_MODEL` (default `claude-opus-5-5`).
- **Funnels.** In Grow → Funnels, hosts create focused pages in their site's style: a free local guide, a waitlist for a season, an offer, last-minute dates (filled from real gaps in the calendar) or a come-back code. Claude writes them (or the rules do without a key). Each funnel gets a promo code that works on the booking site, a public link at `/f/<host>/<funnel>`, sign-ups that land in Guests (subscribed only with consent, tagged with the funnel) and counts of visitors, sign-ups, bookings and revenue.
- **Event ads.** In Grow → Event ads, hosts find events near each home that bring people who need a bed for two or more nights: training courses, conferences, trade shows, county shows, festivals and tournaments (`server/studio/events.js`). Each event is checked against the home's calendar (guests arrive the night before and leave after the last day), so the host sees which nights are still free and what they are worth. One click writes an ad pack for those nights: Facebook and Instagram text with feed (1080 × 1080) and Stories (1080 × 1920) images drawn from the home's first photo, a Google responsive search ad (15 headlines, 4 descriptions, keywords and negatives, all within Google's limits), who to target, when to run and what to spend, and a landing page (a funnel) with the dates, a promo code and a button that opens the booking calendar with those dates picked. Claude writes the copy with `ANTHROPIC_API_KEY` (rules do without); that is the only outside service the feature uses. Events come from our own event finder (`server/studio/crawler.js`), not from any event API: it reads public what's-on, venue and showground pages, training course listings and calendar feeds, pulling out schema.org Event and CourseInstance data (JSON-LD or microdata), `.ics` feeds and, on an event's own page, the dates written on it. It keeps the events in its own index in the `kv` table, shared by every host, and merges duplicates (the same show listed once a day, or on two sites). It asks robots.txt first and follows it for `BookingboosterEvents` or `*`, keeps to Crawl-delay (at least 1.5 seconds between pages), reads at most 25 pages of a site a day, skips noindex pages, and explains itself at `/bot`. Starter pages are in `server/studio/event-sources.json`, hosts add their own (a venue's what's-on page, a course provider's dates), and the background job reads due pages every 20 minutes (`EVENT_CRAWL=off` stops it). Homes are placed from the postcode district in their address with our own table of UK district centres (`server/studio/outcodes.json`, ONS data under the Open Government Licence), so no postcode service either. Hosts can always add an event by hand. The demo uses sample events.
- **Guest app.** Online check-in: an ID photo, the house rules and a signature, plus an optional deposit card held with Stripe. Then the door code, or the host's own arrival notes, together with Wi-Fi and directions. Private details are only shown after check-in or on arrival day. ID photos are deleted 30 days after checkout.
- **Smart locks.** Hosts paste a Nuki Web API token in Connections and pick a lock for each home. Each stay gets its own code, valid only for the stay. The token is stored encrypted and never reaches the browser.
- **Calendar sync add-on.** Two ways to stop double bookings, both dates only (no guest names, prices or messages):
  - *Calendar links (iCal).* Hosts paste each home's link from their channel manager, Airbnb, Vrbo, Booking.com or any other site (Plum Guide, Sykes, Google Calendar...). Links are checked every 10 minutes (`ICAL_SYNC_MINUTES`) and again just before a guest books, if that home's calendars were not read in the last 3 minutes. Each calendar gets its own export link (`/ical/<account>/<home>/<token>.<calendar>.ics`, for example `.airbnb.ics`) carrying direct bookings, blocks made here and the dates read from every *other* calendar, so Airbnb, Vrbo and Booking.com block each other through Bookingbooster without echoing their own dates back. The plain `<token>.ics` link still carries direct bookings and blocks only. Our own dates coming back through a channel manager (same UID or exactly the same dates as a direct booking) are not treated as clashes. A link that suddenly comes back empty keeps its blocks until a second check agrees. Each home shows when it was last checked, how many dates it holds and any error. Links are fetched safely (public addresses only, size and time limits).
  - *Channel manager APIs* (`server/channels.js`), with the host's own key, kept encrypted in `secrets`: Beds24 (invite code), Smoobu (API key), Hostaway (account ID and API key) and Guesty (Open API client ID and secret) are two-way. Dates taken there are blocked here, and every direct booking or host block closes the same nights there within a minute or two (the channel manager then passes it to Airbnb, Booking.com and Vrbo). Lodgify is read only: its public API cannot close dates, so the host adds the Bookingbooster link to Lodgify as well. Homes are linked to listings by name where they match, otherwise the host picks. Cancelling a direct booking reopens its nights; disconnecting reopens everything we closed and deletes the key. Runs are idempotent and one at a time per account. No partner agreements are needed for these; Airbnb, Booking.com and Vrbo's own APIs are only open to approved connectivity partners, so those stay on calendar links.
- **All channels add-on** (`server/channex.js`). Bookingbooster runs one Channex white-label account (`CHANNEX_API_KEY`, staging until Channex certifies us, then `CHANNEX_BASE=https://app.channex.io`). When a host switches it on (at sign-up or in Connections), each home becomes a Channex property with one room type (one unit) and one GBP rate plan, under one group per account. Open nights for the next 500 days are sent as date ranges (two requests per home whatever the window, well inside Channex's 10 a minute per property), straight after any booking, block or price change and once a day anyway. On the £29 plan (`account.tier = 'all'`) nightly prices, weekend extras and minimum stays go too; the £15 plan sends dates only. Bookings from every connected site come in through the Channex booking feed (read every tick, nudged by a global webhook to `/webhooks/channex` with a secret header), are saved as blocks with the site, guest's first name and initial and the reservation code (no contact details kept), then acknowledged; cancellations reopen the nights everywhere. The host links Airbnb, Booking.com, Vrbo and the rest per home in the Channex screen shown inside Connections (one-time token, headless iframe). It never runs at a loss: it only switches on once `CHANNEX_MIN_HOSTS` (default 9) accounts with an active plan have the add-on, enough to cover Channex's monthly fee; until then hosts can join and their homes are set up the moment it switches on (`CHANNEX_ALWAYS_ON=1` skips the wait for testing). Changing or dropping the add-on from the console updates the running Stripe subscription, prorated, and £29 replaces £15 rather than adding to it.
- **Messages.** Booking emails use the designed templates, with texts through Twilio. Replies go to the host's own inbox. With `ANTHROPIC_API_KEY` set, Claude drafts replies in the inbox from the home's facts, and the host always reviews before sending.
- **AI credit.** Each plan includes £50 of AI use a month (`AI_CREDIT_MONTHLY`), reset each billing month from the day the plan was paid. Every AI action a host starts (reply drafts now; the site builder and funnels call `credits.check` and `credits.meter` the same way) is charged at what the model's tokens cost, times `AI_CREDIT_MARKUP`. The allowance is used first, then top-ups, which hosts buy in Plan and billing from £10 to £20,000 through Stripe Checkout and which never expire. At zero, AI actions stop with a prompt to top up. Balances and 30-day usage per host are on /admin, where the team can also add goodwill credit.
- **Contacts.** Grow → Contacts lists everyone the host can reach (guests who booked, funnel sign-ups and uploaded contacts) with filters and search. "Upload contacts" takes a CSV (or rows pasted from a spreadsheet), guesses what each column is and lets the host change it, then shows what will happen before anything is saved: new contacts, people already here (matched by email, then by phone number written any UK way, never when the emails disagree), duplicate rows merged into one, and rows skipped without a valid email or phone. An "Agreed to emails" column or the consent tick decides who is subscribed, and anyone who unsubscribed stays unsubscribed. Each upload can carry a tag. Campaigns can go to "Everyone on your list", which includes contacts who have not stayed yet. All of it is our own code (`BB.contacts` in `web/src/store-ext.js`), no outside service.
- **Guest list and campaigns.** Hosts can import their own guest list from a CSV. Only guests who agreed are subscribed, and anyone who unsubscribed stays unsubscribed. Campaigns go to segments, with signed click and open tracking. Bookings made with the campaign's code are credited to that campaign. Every email carries one-click unsubscribe (`List-Unsubscribe`).
- **AI visibility.** Weekly checks of each home's traveller questions on ChatGPT, Gemini, Perplexity and Google, using whichever keys are set. The console shows the real answers.
- **Visitor counts.** Cookie-free daily counts per site, with the share of visitors who came from search engines or AI assistants. No IP addresses are stored.
- **Own web address.** In Website & SEO a host types their domain and gets three DNS records to add: a TXT record that proves the domain is theirs, a CNAME for `www` and an A record for the bare domain. The site switches over by itself (checked every 10 minutes) once all are in place, and the www address redirects to the bare one. Until it is proved, nothing is served on that domain, so nobody can put their site on someone else's address.
- **Guest reviews.** After checkout guests get an email asking how the stay went. Their rating goes to the host. It only shows on the booking site, and only counts towards the home's rating, if the guest ticks the box to share it, whatever the stars. The site says so, and says that guests who rate get a come-back code.
- **Phone app.** `/app/phone` installs to the home screen (manifest, icons and a service worker). It opens the last copy when there is no signal. Signing out clears that copy.
- **Privacy notice and terms.** `/privacy` and `/terms` are drafted from what the app actually does (`server/legal.js`). They say "Draft" until a solicitor has reviewed them.
- **Account and data.** Hosts can change their details and password, download everything, and delete their account. Deleting ends the Stripe subscription first, then removes the account, sites, bookings, guests, photos and uploads.
- **Billing.** One plan: £197 a month inc. VAT (or £1,970 a year), paid upfront, no setup fee, plus the £15 calendar sync add-on, through Stripe subscriptions and the customer portal. New hosts pay first: sign-up goes straight to Stripe Checkout, and until the first payment the console shows only the payment page (`/app/pay`), billing and account. Team members (ADMIN_EMAILS or `config:admins`) are let through. The welcome email goes out once it is paid.

Some connections show as "Coming soon" in real accounts: Turno, Google Business Profile, Search Console, Google Analytics and PriceLabs. They still work in the demo.

## Partner programme

Anyone can join at `/partners` and gets a link (`/r/<code>`) and a code. A host who signs up through either is theirs: the partner earns a one-off bonus (`AFFILIATE_BONUS`, £50 by default and never more, so a referred host never costs more than £50 to win) when that host makes their first plan payment of at least that much. If that payment is refunded in full the bonus is taken back and the host's next plan payment can earn it again. AI credit top-ups and add-on-only payments earn nothing. The partner dashboard shows link views, clicks, sign-ups and pending and paid earnings. The code lives in `server/affiliates.js`.

- **Attribution.** `/r/<code>`, or `?ref=<code>` on `/`, `/pricing`, `/start`, `/help` or `/partners`, keeps the code in the `bb_ref` cookie for 90 days (`AFFILIATE_COOKIE_DAYS`). `/r/<code>?to=/pricing` sends people to a chosen page. The last link clicked wins. The sign-up form has a "Referral code" box, prefilled from the cookie, and a typed code wins over the cookie. A mistyped code is refused so the partner is not lost. Nobody can refer their own email address. Clicks are counted once a day per visitor.
- **Commission.** Card payments come from Stripe's `invoice.paid`, so the first payment and every renewal count. Each invoice is recorded once, however often Stripe retries. Bank transfers from a host (a package, say) are recorded by the team in `/admin/affiliates`, which works out the commission the same way. Commission is worked out on the amount the host paid, VAT included.
- **Refunds.** Stripe's `charge.refunded` and lost chargebacks (`charge.dispute.closed`) take back the same share of the commission, part refunds included. The team can mark a bank-transfer commission as refunded. If the commission was already paid out, the partner's balance goes negative and comes off their next payout.
- **Payouts.** Commission is on hold for 30 days (`AFFILIATE_HOLD_DAYS`), then it is due. The team pays partners with £50 or more due (`AFFILIATE_MIN_PAYOUT`) by bank transfer, then presses "Mark paid" in `/admin/affiliates`, and the partner gets an email.
- **Partner dashboard** (`/partners/dashboard`): their link and code, clicks, hosts signed up and paying (numbered, never named), every commission with its status, payouts, and where to pay them. Partners have their own sign-in and password reset, separate from host accounts.
- **Team view** (`/admin/affiliates`, "Partners" in the team menu): every partner with clicks, referrals, earned, on hold, due and paid, their payout details, Mark paid, Pause (their link stops working and new payments earn nothing), recording a bank transfer, linking a host to a partner by hand, and the latest commissions.
- On Supabase, run `supabase/affiliates.sql` once before deploying, because the live function does not create tables. The existing Stripe webhook gets the two new refund events added by itself on the next background run. If you set the webhook up by hand, add `charge.refunded` and `charge.dispute.closed` to it.

## Marketing site forms

The marketing sites in `marketing/web-email/sites` (Ledger and Done-for-you) and the four lead pages in `marketing/funnels` (fee leak opt-in, AI audit request, call booking and webinar sign-up) load `https://booking-booster.co.uk/embed/forms.js`. The mock checkout pages do not, because real payments go through Stripe. That script sends every valid form (email plus any other answers, the page it came from and UTM tags) to `/api/leads`. The page's own thank-you message still shows. Each lead is saved and emailed to `SUPPORT_EMAIL`. People whose email is listed in `ADMIN_EMAILS` can see all leads and host accounts at `/admin`. If the app lives somewhere other than `booking-booster.co.uk`, change the script address in those pages.

## Lead follow-up emails

Every lead form starts its own email series (`server/lead-emails.js`), signed by `LEADS_SIGNOFF` and sent from `LEADS_FROM` (or `EMAIL_FROM`):

| Form | Series |
| --- | --- |
| Fee leak opt-in | The guide straight away, five more emails over the next nine days, then three monthly tips |
| AI audit request | A receipt, then waits for the team to send the audit from `/admin` (link, score, top fix), then follow-ups. Booking a call stops the sales emails |
| Book a call | A confirmation with a calendar invite, a reminder the day before, then waits for the team to send the proposal from `/admin` |
| Live demo sign-up | Timed from the session date set in `/admin`: reminders, the replay link when it is added, then follow-ups |
| Ledger and Done-for-you sites | One email saying the message arrived and what happens next |

Series stop when someone unsubscribes (every email has a link) or signs up for an account. Emails more than three days late are skipped rather than sent in a burst. In `/admin`, "Waiting for you" means the next email needs something from the team first.

## Team email campaigns

`/admin/campaigns` is the team's email marketing tool (`server/campaigns.js`, pages in `server/campaigns-admin.js`).

- **Write** a campaign in the branded layout: subject, preview line, heading, text (blank lines for paragraphs, `- ` for lists, `**bold**`, `[words](https://link)`) and an optional button. Personal fields such as `{{first_name}}` work in the subject and text. The five designed campaigns (fee check, AI search check, demo invite, Direct Booking Digest, yearly offer) are there too, and any campaign can be copied as a new draft.
- **Audiences:** all leads or one lead form (fee leak, AI audit, live demo, call), all host accounts or hosts by billing state (paying, not paid yet, payment failed, cancelled), or everyone. Contact-form enquiries are never included. Anyone who unsubscribed, leads who signed up or whose emails the team stopped, and hosts who turned off "News and offers" are always left out.
- **Sending:** send yourself a test first, then type the number of people to confirm and send now or pick a UK date and time. Big lists go out in batches from the background job. A campaign never reaches the same person twice, and failed sends can be retried. A send in progress can be stopped and a schedule cancelled.
- **Results:** unique opens (a guide only, because some email apps load or block images), unique clicks with the links people clicked, unsubscribes from that campaign's link, and failures. Every email has a one-click unsubscribe (`List-Unsubscribe`).

Hosts can switch "News and offers" off in their account page or with the link in each campaign email. Everything is kept in the `kv` table, so this needs no database change.

## Emails to hosts

Sent from the designed templates in `server/emails/host-*.html` (`server/host-emails.js` for the scheduled ones):

| Email | When |
| --- | --- |
| Welcome | On signup |
| Setup checklist | Day 2, from 9am UK time, unless the four required steps are already done |
| Site is live | When the first home goes live |
| Week-3 tips (campaigns and automations) | Day 21, from 9am |
| Weekly report | Mondays from 8am, for the week before. Skipped when a week had no bookings and no visits |
| Payment failed | When Stripe cannot take a plan payment. The account shows "Payment failed" until an invoice is paid |

Hosts can turn off the checklist, tips and weekly report under "Emails from us" on the account page, or with the unsubscribe link in each one. Welcome, billing and security emails always go.

## Stripe setup

1. Turn on Connect (Express accounts) in your Stripe dashboard.
2. On the live server this happens by itself once the key is set (see `server/stripe-auto.js`). By hand: run `STRIPE_SECRET_KEY=sk_live_... BASE_URL=https://booking-booster.co.uk npm run stripe-setup`. It creates the monthly and yearly prices (VAT included; the yearly plan is 10 months' price, the yearly add-on is £180) and two webhooks to `/webhooks/stripe`: one for platform events (`checkout.session.completed`, `checkout.session.expired`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`, `charge.refunded`, `charge.dispute.closed`) and a Connect one for hosts' `account.updated`. It prints the ids and signing secrets to add as secrets. Running it again reuses what exists.
3. In Stripe's customer portal settings, let customers update cards and cancel at the end of the period.

`npm run preflight` lists any launch setting that is still missing. In production the server also logs that list on start. The full launch steps are in `LAUNCH.md`.

## How it is built

- `server/` is plain Node: `node:http` for the web server and `node:sqlite` for storage (one file in `DATA_DIR`).
- `web/src/` holds the app, the same code as the prototype. `npm run build` bundles it, and the server also builds it on start.
- Business rules (`web/src/store.js` and `store-ext.js`) run in two places: in the browser for instant feedback, and on the server, one sandbox per account, which keeps the saved copy. Every action runs on the server too, and other open devices update over server-sent events.
- Actions never call outside services themselves. They queue effects (send an email, charge a card, check a calendar), and `server/effects.js` carries those out for real accounts only.
- What a guest's browser can see is cut down in `server/public.js`. Booking sites get availability only, and a trip link gets that one booking.

| File | Job |
| --- | --- |
| `server/index.js` | Routes, the public booking API, the host API, webhooks and background jobs |
| `server/engine.js`, `workspaces.js` | Account sandboxes, saving, live updates |
| `server/effects.js` | Emails, texts, refunds, payment links, door codes, calendar checks, AI checks |
| `server/stripe.js`, `messaging.js`, `ical.js`, `ai.js`, `assist.js` | Outside services |
| `server/seo.js` | Structured data, crawlable page content, `llms.txt`, sitemaps |
| `server/secrets.js` | Per-host credentials, encrypted at rest |
| `server/visits.js` | Cookie-free visitor counts |
| `server/leads.js`, `lead-emails.js` | Lead follow-up email series |
| `server/host-emails.js` | Setup checklist, week-3 tips, weekly report and payment failed emails to hosts |
| `server/domains.js` | Hosts' own domains: DNS checks and certificates |
| `server/affiliates.js` | Partner programme: referral links, commission, refunds, partner dashboard and payouts |
| `server/backup.js` | Daily database backups |
| `server/preflight.js`, `scripts/stripe-setup.js` | Launch settings check, one-off Stripe prices and webhooks |
| `LAUNCH.md` | Step-by-step launch on Fly.io |
| `web/sw.js`, `web/icons/` | Installable phone app |
| `test/` | End-to-end tests, with stand-in Stripe, email and Claude APIs |

## Deploying

Any host that runs a long-lived Node process works, for example Fly.io, Render, Railway or a small VPS. There is a `Dockerfile` for any container host, and a `fly.toml` for Fly.io (London region, with a disk at `/data`): run `fly launch --no-deploy`, `fly volumes create bb_data --size 1`, add your keys with `fly secrets set`, then `fly deploy`. Keep `DATA_DIR` on a persistent disk. The server copies the database into `DATA_DIR/backups` once a day and keeps the newest `BACKUP_KEEP` copies (14 by default). Copy that folder and `DATA_DIR/media` (host photos) off the machine too, for example with your host's volume snapshots. Backups still hold deleted accounts until they age out, so say so in the privacy policy. Set `APP_SECRET` to a long random value, because it signs sessions and guest links and protects the stored host credentials. Put HTTPS in front, and set `BASE_URL` to the `https://` address so cookies are marked secure. For free site addresses, point a wildcard DNS record (`*.bookingbooster.site`) at the server and set `SITES_DOMAIN`.

Hosts' own domains need a certificate each:

- **On a VPS with Caddy**, use `deploy/Caddyfile`. Caddy asks `/tls/ask` before issuing a certificate, and the app only says yes to proved domains.
- **On Fly.io**, set `FLY_API_TOKEN` and `FLY_APP_NAME`. The app adds a certificate for the domain and its www address as soon as it is proved.
- Set `CUSTOM_DOMAIN_TARGET` to the name hosts should point `www` at (it defaults to the `BASE_URL` host), and `CUSTOM_DOMAIN_IPS` to the server's IPv4 addresses for the bare-domain A record.

### Buying a new domain for a host (20i)

The "Get a new domain" tab at sign-up buys the domain for the host through our 20i reseller account (`server/registrar.js`). It is off until `TWENTYI_API_KEY` is set; until then the tab only shows a pretend search.

1. The sign-up page checks availability with 20i's domain search. We offer `DOMAIN_TLDS` (default `.co.uk`, `.uk`, `.com`), and an account gets `DOMAINS_PER_ACCOUNT` new domains (default 1).
2. The host gives a postal address and phone number. The domain is registered in their name (Nominet needs both for `.uk`), so it is theirs to keep or move.
3. Nothing is bought until the first plan payment goes through. Then the app registers it for one year, paid from the 20i balance.
4. With `TWENTYI_PACKAGE_ID` set (booking-booster.co.uk on 20i hosting), the name is added to that package. 20i's DNS points it there and its free Let's Encrypt certificate is switched on. Without it (Fly.io, a VPS), the app writes the A and CNAME records to `CUSTOM_DOMAIN_IPS` and `CUSTOM_DOMAIN_TARGET` and asks Fly (or Caddy) for the certificate. Either way the domain is live without a TXT check, because we bought it.
5. Every day, domains that run out within 30 days are renewed for a year while the plan is paid. With `DOMAIN_RENEWAL=charge` the renewal price (`DOMAIN_RENEWAL_PRICE`) goes on the host's next invoice; the default is that the plan covers it. If the plan has ended, the domain is left to lapse.

Keep the 20i balance topped up (my.20i.com, Reseller, Balance): registrations and renewals fail when it runs out, and the app retries a few times and logs `registrar` errors.

ChatGPT, Gemini, Perplexity, Google, Claude and Copilot are trademarks of their owners. Bookingbooster is not affiliated with or endorsed by them.

## Deploying

See [DEPLOY.md](DEPLOY.md). Pushing to `main` deploys the Supabase functions through the Supabase GitHub integration.
