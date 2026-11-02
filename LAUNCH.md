# Launching Bookingbooster

The app is ready to deploy. These are the steps that need you, in order. Each one says what to do and where.
Run `npm run preflight` at any point to see what is still missing.

Never paste keys or passwords into a chat. They go straight into Fly secrets (step 5).

## 1. Company details (you, about 15 minutes)

- [ ] **Company number and registered office address.** These are shown in every email footer and on the legal pages.
- [ ] **VAT number**, if you are VAT registered. All prices are shown with VAT included.
- [ ] **Register with the ICO** and pay the data protection fee (£52 a year for most small companies) at ico.org.uk/fee. Any UK business that handles customer data must do this.
- [ ] **Support email.** The default is help@booking-booster.co.uk, and it needs a real inbox behind it.
- [ ] **Team emails** that can open `/admin` to see leads and send audits and proposals.

## 2. Legal review (solicitor)

- [ ] Send your solicitor `/privacy` and `/terms`. Both are drafted from what the app actually does: `server/legal.js`, or open the pages once deployed.
- [ ] Ask them to check three things in particular:
  - the liability cap;
  - the data processing schedule at the end of the terms (hosts are the controller of guest data and we are the processor), including the 48-hour breach notice and 30 days' notice of new sub-processors;
  - the review policy: guests opt in to publishing, and get a come-back code for rating, whatever their rating.
- [ ] When they sign off, set `LEGAL_REVIEWED` to that date (step 5). The "Draft" notes then disappear.

## 3. Accounts to open (you)

| Service | What to do | You get |
| --- | --- | --- |
| **Fly.io** | Sign up at fly.io and add a card. Expect about $5 to $10 a month to start | Hosting in London |
| **Stripe** | Activate the account for Bookingbooster Ltd. Turn on **Connect** (Express accounts, platform in the UK). Copy the **live secret key** | `sk_live_…` |
| **Resend** | Add the domains `booking-booster.co.uk` and `mail.booking-booster.co.uk`, add the DNS records it shows, and wait until both say Verified. Then create an API key | `re_…` |
| **Twilio** (optional) | Buy a UK number or register an alphanumeric sender for texts to guests | Account SID, auth token, sender |
| **AI checks** (optional) | Any of: OpenAI, Gemini, Perplexity or SerpApi keys. An Anthropic key turns on suggested replies in the inbox | API keys |

**Email DNS records.** At your registrar, add the records Resend shows: SPF, DKIM and a return path, for both domains. Then add one DMARC record so mailbox providers trust the mail:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:help@booking-booster.co.uk` |

After a month of clean reports, change `p=none` to `p=quarantine`.

## 4. Install the Fly tool (you, on your computer)

```
curl -L https://fly.io/install.sh | sh      # or: brew install flyctl
fly auth login
```

You also need Node 22.13 or newer (from nodejs.org) for the Stripe step. Then open a terminal in the `app` folder (this folder).

## 5. Create the app and add the secrets

```
fly launch --no-deploy --copy-config --name bookingbooster --region lhr
fly volumes create bb_data --region lhr --size 1
fly ips allocate-v4                        # a dedicated IPv4 (about $2 a month), for hosts' own domains
fly ips list                               # note the v4 address for CUSTOM_DOMAIN_IPS below
```

If the name `bookingbooster` is taken on Fly, pick another one (for example `bookingbooster-uk`). `fly launch` then updates `fly.toml` with it.

```
fly secrets set \
  APP_SECRET=$(openssl rand -hex 32) \
  BASE_URL=https://booking-booster.co.uk \
  ADMIN_EMAILS="you@booking-booster.co.uk" \
  COMPANY_NAME="Bookingbooster Ltd" \
  COMPANY_ADDRESS="Registered office, Street, Town, Postcode" \
  COMPANY_NUMBER="12345678" \
  VAT_NUMBER="GB123456789" \
  SUPPORT_EMAIL=help@booking-booster.co.uk \
  RESEND_API_KEY=re_... \
  EMAIL_FROM="Bookingbooster <hello@booking-booster.co.uk>" \
  GUEST_EMAIL_DOMAIN=mail.booking-booster.co.uk \
  STRIPE_SECRET_KEY=sk_live_... \
  CUSTOM_DOMAIN_IPS=<the v4 address> \
  FLY_API_TOKEN="$(fly tokens create deploy)"
```

The app uses `FLY_API_TOKEN` to add a certificate whenever a host connects their own domain. If `fly logs` ever shows a "fly certificate" error, add the certificate by hand with `fly certs add theirdomain.co.uk` and `fly certs add www.theirdomain.co.uk`.

Twilio and AI keys go in the same way: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `PERPLEXITY_API_KEY`, `SERPAPI_KEY` and `ANTHROPIC_API_KEY`.

## 6. Deploy and point the domain

```
fly deploy
fly certs add booking-booster.co.uk
```

At your domain registrar, add the record Fly shows. Usually that is a CNAME from `app` to `<your-app>.fly.dev`. Then wait for `fly certs show booking-booster.co.uk` to say Issued. Check that https://booking-booster.co.uk/healthz shows `{"ok":true}`.

## 7. Stripe prices and webhooks (one command)

On your computer, in the `app` folder:

```
STRIPE_SECRET_KEY=sk_live_... BASE_URL=https://booking-booster.co.uk npm run stripe-setup
```

This creates:
- the plan prices (£200 a month, or £2,000 a year, which is 2 months free) and the one-off £997 setup fee, taken at checkout (the first month is free, so the plan is first billed a month later);
- the £15 add-on;
- both webhooks.

It prints the lines to copy into `fly secrets set ...`. Setting secrets restarts the app.

In the Stripe dashboard:
- Under **Settings > Billing > Customer portal**, allow card updates and cancelling at the end of the period.
- Under **Settings > Customer emails**, turn on receipts for successful payments. The payment failed email tells hosts they will get one when a retry works. Leave Stripe's own failed payment emails off, because the app sends its own.
- Under **Settings > Billing > Subscriptions and emails**, keep Smart Retries on and set "If all retries fail" to cancel the subscription. The payment failed email says this is what happens.
- Under **Settings > Connect > Branding**, add the Bookingbooster name and logo.

## 8. Free site addresses (optional)

Do this if you want hosts to get `theirhome.bookingbooster.site` before connecting their own domain:
1. Register the domain.
2. Add a wildcard `*` CNAME pointing to `<your-app>.fly.dev`.
3. Run `fly certs add "*.bookingbooster.site"` and add the `_acme-challenge` CNAME it shows.
4. Set the secret `SITES_DOMAIN=bookingbooster.site`.

Without this, sites live at `booking-booster.co.uk/s/<account>/<home>`, which works fine.

## 9. Final check before telling anyone

```
fly ssh console -C "node server/preflight.js"     # should end with: Ready for launch.
```

- [ ] Sign up as a host at https://booking-booster.co.uk/start with your own email. Check that the welcome email arrives and is not in spam.
- [ ] Connect Stripe from Connections and complete the Express onboarding for a test host.
- [ ] Book a real night on the test host's site with your own card. Then refund it from the console and check the refund reaches the card.
- [ ] Add a card under Plan and billing, then cancel in the Stripe portal.
- [ ] Fill in one of the marketing forms and check that the guide email arrives and the lead shows in `/admin`.
- [ ] Open `/admin`, set the next live demo date and links, and download a backup.
- [ ] Set `LEGAL_REVIEWED` once the solicitor signs off.

## After launch

- Fly takes a daily snapshot of the data volume and keeps it for 5 days. The app also keeps 14 daily database copies, and `/admin` has a download link. Download one each week and keep it somewhere else.
- `fly logs` shows what the server is doing. Errors are logged with the page that failed.
- To ship an update, run `fly deploy` from this folder.
