-- Partner programme tables (server/affiliates.js). The live Supabase function does not create tables itself,
-- so run this once in the Supabase SQL editor (or as a migration) before deploying the partner programme.
-- Same as server/schema.js. Row-level security on with no policies: only the function (service key) can read them.
create table if not exists affiliates (
  id text primary key, code text not null unique, email text not null, name text not null, pass text not null,
  payout text not null default '', status text not null default 'active', created_at bigint not null);
create unique index if not exists affiliates_email_lower on affiliates (lower(email));
create table if not exists aff_sessions (token text primary key, affiliate_id text not null references affiliates(id) on delete cascade, expires_at bigint not null);
create table if not exists aff_clicks (affiliate_id text not null, day text not null, n integer not null default 0, primary key (affiliate_id, day));
create table if not exists referrals (workspace_id text primary key, affiliate_id text not null references affiliates(id), how text not null, created_at bigint not null);
create table if not exists commissions (
  id text primary key, affiliate_id text not null references affiliates(id), workspace_id text not null, kind text not null, source text not null,
  gross integer not null, amount integer not null, reversed integer not null default 0, refs text not null default '', note text,
  clears_at bigint not null, created_at bigint not null, updated_at bigint not null);
create table if not exists aff_payouts (id bigserial primary key, affiliate_id text not null references affiliates(id), amount integer not null, reference text, created_at bigint not null);
create index if not exists comm_aff on commissions(affiliate_id, created_at);
create index if not exists ref_aff on referrals(affiliate_id);
alter table affiliates enable row level security;
alter table aff_sessions enable row level security;
alter table aff_clicks enable row level security;
alter table referrals enable row level security;
alter table commissions enable row level security;
alter table aff_payouts enable row level security;
