# Deploying Bookingbooster

- **Back end:** Supabase project `butpfekggdxafkjmfwmh`. The GitHub integration deploys the functions in
  `supabase/config.toml` (bb, guides-a, guides-b) on every push to `main`.
  After changing anything under `server/` or `web/`, run `npm run build:supabase` and commit `supabase/functions/bb/app.mjs`.
- **Website address:** booking-booster.co.uk is a 20i Linux package whose `public_html` holds
  `supabase/20i/index.php` (with the proxy key filled in) and `supabase/20i/.htaccess`. They forward every request to the bb function.
- **Background jobs:** pg_cron job `bookingbooster-tick` posts to `/jobs/tick` every 5 minutes.
- **Keys:** the proxy key and jobs key live in the `kv` table (`config:proxy_key`, `config:jobs_key`), never in git.
