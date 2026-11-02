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
| `/admin` | Team only (`ADMIN_EMAILS`): leads, their follow-up emails, live demo settings, host accounts and the latest backup |
| `/guides/<name>.pdf` | The free guides that the lead forms promise |

## What works in a real account

- **Accounts.** Sign-up, sign-in, password reset by email, sessions in secure cookies, one workspace per host.
- **Booking sites.** Each home gets a site rendered on the server so search engines and AI assistants can read it: VacationRental and FAQPage structured data, `robots.txt` that welcomes AI crawlers, `sitemap.xml` and `llms.txt`. Hosts upload their own photos and write the guest details, area guide and house rules in Website & SEO. Nothing is made up for them.
- **Bookings.** With Stripe connected, guests pay through Stripe Checkout and the money goes straight to the host's Stripe account (Connect, destination charges). The dates are held for 30 minutes while they pay. Without Stripe, the site takes a booking request that the host accepts or declines. Accepting sends the guest a payment link once Stripe is connected.
- **Guest app.** Online check-in: an ID photo, the house rules and a signature, plus an optional deposit card held with Stripe. Then the door code, or the host's own arrival notes, together with Wi-Fi and directions. Private details are only shown after check-in or on arrival day. ID photos are deleted 30 days after checkout.
- **Smart locks.** Hosts paste a Nuki Web API token in Connections and pick a lock for each home. Each stay gets its own code, valid only for the stay. The token is stored encrypted and never reaches the browser.
- **Calendar sync add-on.** Hosts paste calendar links (iCal) from their channel manager, Airbnb, Vrbo or Booking.com. Links are checked every 15 minutes. Only dates move: no names, prices or messages. Clashes raise an alert. Each home also publishes its own feed so those sites can block direct bookings in return. Links are fetched safely (public addresses only, size and time limits).
- **Messages.** Booking emails use the designed templates, with texts through Twilio. Replies go to the host's own inbox. With `ANTHROPIC_API_KEY` set, Claude drafts replies in the inbox from the home's facts, and the host always reviews before sending.
- **Guest list and campaigns.** Hosts can import their own guest list from a CSV. Only guests who agreed are subscribed, and anyone who unsubscribed stays unsubscribed. Campaigns go to segments, with signed click and open tracking. Bookings made with the campaign's code are credited to that campaign. Every email carries one-click unsubscribe (`List-Unsubscribe`).
- **AI visibility.** Weekly checks of each home's traveller questions on ChatGPT, Gemini, Perplexity and Google, using whichever keys are set. The console shows the real answers.
- **Visitor counts.** Cookie-free daily counts per site, with the share of visitors who came from search engines or AI assistants. No IP addresses are stored.
- **Own web address.** In Website & SEO a host types their domain and gets three DNS records to add: a TXT record that proves the domain is theirs, a CNAME for `www` and an A record for the bare domain. The site switches over by itself (checked every 10 minutes) once all are in place, and the www address redirects to the bare one. Until it is proved, nothing is served on that domain, so nobody can put their site on someone else's address.
- **Guest reviews.** After checkout guests get an email asking how the stay went. Their rating goes to the host. It only shows on the booking site, and only counts towards the home's rating, if the guest ticks the box to share it, whatever the stars. The site says so, and says that guests who rate get a come-back code.
- **Phone app.** `/app/phone` installs to the home screen (manifest, icons and a service worker). It opens the last copy when there is no signal. Signing out clears that copy.
- **Privacy notice and terms.** `/privacy` and `/terms` are drafted from what the app actually does (`server/legal.js`). They say "Draft" until a solicitor has reviewed them.
- **Account and data.** Hosts can change their details and password, download everything, and delete their account. Deleting ends the Stripe subscription first, then removes the account, sites, bookings, guests, photos and uploads.
- **Billing.** One plan: a one-off £997 setup fee, first month free, then £200 a month inc. VAT, plus the £15 calendar sync add-on, through Stripe subscriptions and the customer portal.

Some connections show as "Coming soon" in real accounts: Turno, Google Business Profile, Search Console, Google Analytics and PriceLabs. They still work in the demo.

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
2. Run `STRIPE_SECRET_KEY=sk_live_... BASE_URL=https://booking-booster.co.uk npm run stripe-setup`. It creates the monthly and yearly prices and the one-off £997 setup fee (VAT included; the yearly plan is 10 months' price, the yearly add-on is £180) and two webhooks to `/webhooks/stripe`: one for platform events (`checkout.session.completed`, `checkout.session.expired`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`) and a Connect one for hosts' `account.updated`. It prints the ids and signing secrets to add as secrets. Running it again reuses what exists.
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

ChatGPT, Gemini, Perplexity, Google, Claude and Copilot are trademarks of their owners. Bookingbooster is not affiliated with or endorsed by them.

## Deploying

See [DEPLOY.md](DEPLOY.md). Pushing to `main` deploys the Supabase functions through the Supabase GitHub integration.
