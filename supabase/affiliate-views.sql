-- Link views for the partner dashboard (server/affiliates.js). Run once in the Supabase SQL editor before deploying.
-- Safe to run more than once. Until it runs, partner links still work but views are not counted.
alter table aff_clicks add column if not exists views integer not null default 0;
