-- Bulk lead import columns (server/lead-import.js). The live Supabase function does not change tables itself,
-- so run this once in the Supabase SQL editor (or as a migration) before deploying the lead import.
-- Same as server/schema.js. Additive only: new nullable columns and two indexes. It does not add, change or remove any lead.
alter table leads add column if not exists phone text;
alter table leads add column if not exists source text;
alter table leads add column if not exists consent_at text;
alter table leads add column if not exists has_email integer;
alter table leads add column if not exists import_batch text;
create index if not exists leads_email_lower on leads (lower(email));
create index if not exists leads_phone on leads (phone);
update leads set has_email = case when coalesce(email, '') = '' then 0 else 1 end where has_email is null;
