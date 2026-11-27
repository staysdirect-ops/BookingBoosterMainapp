# ManyChat: sales answers and free guide delivery in DMs

ManyChat answers the questions people ask in Instagram and Facebook DMs (pricing, what's included, Airbnb fees, AI search, setup), handles the usual objections, and hands people on to sign-up or a call. It also gives away the 9 free guides: someone comments or DMs a keyword, ManyChat asks for their email, and the guide arrives in the DM and by email.

Every email collected goes into our own leads list (`/admin`, source `manychat`), so it sits next to the website leads and follows the same unsubscribe rules.

The message copy for every flow is in [flows.md](flows.md).

## How it fits together

```
Comment or DM keyword
  -> ManyChat flow: asks for email, asks if they want tips (consent)
  -> External Request: POST https://booking-booster.co.uk/webhooks/manychat
       our server saves the lead (source manychat), starts the "Free guide (DM)" emails
       and answers with the guide link
  -> ManyChat sends the Download button in the DM
```

Emails after a guide request (`server/lead-emails.js`, series `guide`):

| Email | When | Who gets it |
|---|---|---|
| G1 Your copy: (guide) | Straight away | Everyone who asked |
| G2 Where direct bookings actually come from | Day 2 | Only people who said yes to tips |
| G3 Do I have to leave Airbnb? | Day 5 | Only people who said yes to tips |
| G4 Your direct booking site, set up for you (£197 offer) | Day 8 | Only people who said yes to tips |

People who already have an account stop getting them, and one-click unsubscribe works as for every lead email. Under PECR, sole-trader hosts count as individuals, so we only send the tips to people who said yes in the DM. The guide itself is what they asked for, so it always goes.

## What the webhook takes

`POST /webhooks/manychat` with header `X-BB-Key: <MANYCHAT_SECRET>` and a JSON body:

| Field | Required | Notes |
|---|---|---|
| `email` | yes | ManyChat system field Email |
| `guide` | for guides | one of `playbook`, `leak`, `templates`, `audit`, `aiguide`, `checklist`, `website`, `repeat`, `swipe` (any case) |
| `consent` | no | `yes` sends the 3 tip emails, anything else sends only the guide |
| `channel` | no | `instagram`, `facebook`, `messenger` or `whatsapp` |
| `name`, `topic`, `homes`, `town`, `subscriber_id`, `phone` | no | saved on the lead. `topic` is used for sales leads with no guide, for example `book-call` |

It answers `{ ok, lead_id, guide_title, guide_url, signup_url }`. `signup_url` is the Growth sign-up with `utm_source=<channel>&utm_medium=dm&utm_campaign=manychat`, so DM sign-ups can be counted. A request with no `guide` saves a sales lead and emails the team, with no email series. A wrong or missing key gets 401. With `MANYCHAT_SECRET` blank, the webhook is off.

## Setup (yours to do, about 2 hours)

### 1. Turn on the webhook (5 minutes)
1. Make a secret: run `openssl rand -hex 24` in a terminal, or use any password generator for 40+ random letters and numbers. Keep it somewhere safe.
2. Supabase dashboard > project `butpfekggdxafkjmfwmh` > Edge Functions > Secrets > Add `MANYCHAT_SECRET` with that value.
3. Once this pull request is merged and deployed, check it: `curl -s -X POST https://booking-booster.co.uk/webhooks/manychat` should answer `{"error":"Not allowed"}` (401). That means it is live and locked.

### 2. ManyChat account (15 minutes)
1. Sign up at manychat.com with the business Facebook login that owns the Bookingbooster Page.
2. Connect **Instagram** (it must be a Professional account linked to the Facebook Page) and **Facebook Messenger**. Leave WhatsApp off for now (see Costs).
3. In Instagram on your phone: Settings > Messages and story replies > Message controls > Connected tools > turn on **Allow access to messages**. ManyChat cannot read DMs without it.
4. Upgrade to **Pro** at the smallest contact tier. External Request (the step that talks to our server) and email collection need Pro. Do not add the AI add-on yet.
5. Settings > General: time zone **London**.

### 3. Fields and tags (10 minutes)
Settings > Fields > Custom user fields, create:

| Name | Type |
|---|---|
| `bb_guide` | Text |
| `bb_consent` | Text |
| `bb_guide_url` | Text |
| `bb_signup_url` | Text |
| `bb_topic` | Text |
| `bb_homes` | Text |

Settings > Tags, create: `guide-requested`, `wants-call`, `hot-lead`, `human-needed`, `objection-price`, `objection-website`, `objection-airbnb`, `objection-time`.

### 4. The shared External Request (10 minutes)
You build this once, inside the flow **"Send to Bookingbooster"** (see flows.md, flow S1), and every other flow jumps to it.
1. Action > **External Request**. Method **POST**. URL `https://booking-booster.co.uk/webhooks/manychat`.
2. Headers: `Content-Type: application/json` and `X-BB-Key: <your secret>`.
3. Body (JSON), using ManyChat's insert-field button for each value:
```json
{
  "email": "{{email}}",
  "name": "{{full_name}}",
  "guide": "{{bb_guide}}",
  "consent": "{{bb_consent}}",
  "topic": "{{bb_topic}}",
  "homes": "{{bb_homes}}",
  "channel": "instagram",
  "subscriber_id": "{{user_id}}"
}
```
   Make one copy of the flow for Messenger with `"channel": "facebook"`, or use ManyChat's Last Interaction channel field if your plan shows it.
4. Response mapping: `$.guide_url` > `bb_guide_url`, `$.signup_url` > `bb_signup_url`.
5. Press **Test the request** with your own email and `bb_guide` = `playbook`. You should get the playbook email within a minute and see the lead in `/admin`.

### 5. Build the flows (about 90 minutes)
Follow [flows.md](flows.md) in order: S1 first, then the guide flows (G), then the sales flows (M, Q, O, C). Each one lists the trigger, every message word for word, the buttons, and where each button goes.

ManyChat has no file import for flows. The only import is a template link shared from another ManyChat account, so the flows are written as build steps. Once you have built them, Settings > Templates can package them as a template, which is your backup and your way to copy them to a second account.

### 6. Go live checklist
- [ ] Test every keyword from a personal Instagram account (not the business one: ManyChat ignores messages from the account itself).
- [ ] Comment each guide keyword on a test post and check the public reply, the DM, the email and the lead in `/admin`.
- [ ] Type something random and check the default reply shows the main menu.
- [ ] Tap "Talk to a person" and check the team gets the notification.
- [ ] Add the book-a-call link in `/admin` > Settings (`book_call_url`). Flow C1 uses the same link.
- [ ] Pin a post or story highlight that tells people the keywords (copy in flows.md, "Posts that drive the keywords").

## Costs, and the £25 customer cost rule

The project rule is that a new customer must never cost more than £50, with a target of £25 or under, and nothing may run at a loss over any 3 months.

**What ManyChat costs.** ManyChat changed its plans in March 2026 and both price lists are still quoted, so check the number on your billing page. Pro at the smallest tier (500 contacts) is between $15 and $39 a month, roughly **£12 to £31**. It grows with contacts: around 5,000 contacts is about $164 (about £130) a month on the newer plans. WhatsApp adds Meta's per-conversation fees on top, which is why it stays off at launch. The AI add-on is extra and not needed: the flows use keywords and buttons.

**What one customer is worth.** Growth is £197 a month including VAT, so about £164 after VAT, every month they stay.

**What that means for customer cost.** Budget £31 a month for ManyChat (the top of the range):

| DM sign-ups a month | ManyChat cost per customer | Against the rule |
|---|---|---|
| 0 | n/a (£31 a month spent, nothing back) | Stop rule below applies |
| 1 | £31 | Under the £50 cap, over the £25 target |
| 2 | £15.50 | On target |
| 4 | £7.75 | Well under target |

One customer a month more than pays for the tool (£164 in, £31 out), so ManyChat can't put the business at a loss on its own. The risk is paying for it while it brings in nobody.

Rules that keep it inside the limits:
1. **Organic only at first.** The flows run on comments and DMs from our own posts, which cost nothing. If you later run Meta ads into ManyChat (click-to-DM ads), ad spend counts towards customer cost too. Cap ad spend at **£25 × the sign-ups you expect**, and pause any ad whose cost per sign-up passes £25.
2. **Stay on the smallest tier.** The contact count grows with everyone who ever messages, so delete contacts who have been inactive for 90 days (Contacts > filter Last Interaction > Bulk actions > Delete). That keeps the bill near the bottom tier.
3. **Count it every month.** In `/admin`, leads with source `manychat`, matched to new accounts with the same email. Sign-ups from `bb_signup_url` carry `utm_medium=dm`. ManyChat cost ÷ those sign-ups is the customer cost.
4. **Stop rule.** If two months in a row bring fewer than 2 DM sign-ups (customer cost over £15.50, heading past £25), drop to the Free plan. The guides can still go out by plain link, and only the email capture is lost. Look again after the next content push.
5. **WhatsApp only once it pays.** Switch it on when Instagram and Messenger bring 4 or more sign-ups a month, and only if hosts are asking for it.
