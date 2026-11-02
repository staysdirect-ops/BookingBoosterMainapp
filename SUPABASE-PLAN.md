# Moving the Bookingbooster back end to Supabase

Chosen on 2 November 2026: the website sits on the 20i hosting package for booking-booster.co.uk, and the back end and database run on Supabase (free plan to start).

## How the pieces fit

```
visitor ──> booking-booster.co.uk (20i Linux hosting)
              ├─ static files: CSS, JS, images, guides, icons      (served by 20i directly)
              └─ everything else ──> index.php (thin pass-through) ──> Supabase Edge Function "api"
                                                                        └─> Supabase Postgres
Supabase pg_cron ──every 15 min──> Edge Function "api" /jobs/tick   (calendar sync, lead and host emails)
Stripe webhooks ──> booking-booster.co.uk/webhooks/stripe ──> same function
```

Why the PHP pass-through: Supabase only serves web pages (HTML) from its functions on a paid custom domain
(see https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled).
20i hosting runs PHP, so a ~40-line `index.php` forwards each request to the function and returns the answer.
That keeps one address for Google, avoids cross-site cookie problems and costs nothing extra.

## Work, in order

1. **Database.** Create the same 12 tables in Postgres (workspaces, users, sessions, domains, outbox, leads,
   payments, secrets, resets, lead_seq, lead_optout, kv). Row-level security on, with no public access. Only the function
   uses the service key.
2. **Data layer.** `server/db.js` uses SQLite and is synchronous, with 67 call sites. Make it async against Postgres and
   update the callers.
3. **Function.** Run the existing router inside one Deno Edge Function through a small request/response adapter.
   Things that assume one long-running server need changing:
   - the in-memory workspace cache: reload from the database each request;
   - live updates over `/api/stream`: the browser polls `/api/state` instead;
   - `setInterval` timers: move to `/jobs/tick`, run by pg_cron;
   - `node:vm` in `engine.js`: check it under Deno and replace it if needed;
   - backups: Supabase has daily backups on Pro, and `/admin/backup` exports JSON instead.
4. **Secrets.** APP_SECRET, Stripe, Resend and the AI keys go into Supabase function secrets. You type them
   in the Supabase dashboard, never in chat.
5. **20i.** Upload `web/` assets and `index.php` plus `.htaccess` to the package. Point booking-booster.co.uk and www at
   the 20i package. They already point at 20i.
6. **Hosts' own domains.** These are added as alias domains on the 20i package, by hand at first or later through the 20i API.
7. **Tests.** Re-run the 42 tests against the new data layer, then do a live smoke test (sign-up, booking, Stripe test mode,
   lead form).
8. **Google.** Submit `https://booking-booster.co.uk/sitemap.xml` in Search Console. The domain is already verified.

## Costs

- 20i: nothing extra, because the package came out of the reseller allowance.
- Supabase Free: £0. It pauses after 7 days without traffic and has no daily backups.
- Supabase Pro: about $25 a month. Worth it once real hosts sign up.
