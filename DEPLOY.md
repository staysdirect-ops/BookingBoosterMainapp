# Deploying Bookingbooster

- **Back end:** Supabase project `butpfekggdxafkjmfwmh`. The GitHub integration deploys the functions in
  `supabase/config.toml` (bb, guides-a, guides-b) on every push to `main`.
  After changing anything under `server/` or `web/`, run `npm run build:supabase` and commit `supabase/functions/bb/app.mjs`.
- **Website address:** booking-booster.co.uk is a 20i Linux package whose `public_html` holds
  `supabase/20i/index.php` (with the proxy key filled in) and `supabase/20i/.htaccess`. They forward every request to the bb function.
- **Background jobs:** pg_cron job `bookingbooster-tick` posts to `/jobs/tick` every 5 minutes.
- **Keys:** the proxy key and jobs key live in the `kv` table (`config:proxy_key`, `config:jobs_key`), never in git.
- **New tables:** the function does not create tables. Before deploying the partner programme, run `supabase/affiliates.sql` once in the Supabase SQL editor. Before deploying partner link views, run `supabase/affiliate-views.sql` once the same way (adds a `views` column; until then links still work but views are not counted). Before deploying the bulk lead import, run `supabase/lead-import.sql` once the same way (new columns on `leads`; without them the website lead form and the import fail). Before switching on domain buying at sign-up (setting `TWENTYI_API_KEY`), run `supabase/registrations.sql` once the same way (new `registrations` table; until the key is set nothing reads it).
