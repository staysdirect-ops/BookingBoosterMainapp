-- Domain purchases at sign-up (server/registrar.js). The live Supabase function does not change tables itself,
-- so run this once in the Supabase SQL editor (or as a migration) before setting TWENTYI_API_KEY.
-- Same as server/schema.js. Additive only: one new table.
create table if not exists registrations (
  host text primary key, workspace_id text not null, property_id text not null, status text not null, years integer not null default 1,
  contact text, error text, attempts integer not null default 0, registered_at bigint, expires_at bigint, renewed_at bigint,
  created_at bigint not null, updated_at bigint not null);
