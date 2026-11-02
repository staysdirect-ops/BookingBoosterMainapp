// Postgres tables (Supabase in production, PGlite for local runs and tests). Times are milliseconds since 1970.
'use strict';
module.exports = `
create table if not exists workspaces (
  id text primary key, kind text not null, state text not null, version integer not null default 1,
  slug text unique, plan text, stripe_account text, stripe_customer text, billing_status text,
  created_at bigint not null, updated_at bigint not null, last_seen bigint not null);
create table if not exists users (
  id text primary key, email text not null, name text, pass text not null,
  workspace_id text not null references workspaces(id), verified integer not null default 0, created_at bigint not null);
create unique index if not exists users_email_lower on users (lower(email));
create table if not exists sessions (
  token text primary key, user_id text not null references users(id) on delete cascade, created_at bigint not null, expires_at bigint not null);
create table if not exists domains (
  host text primary key, workspace_id text not null references workspaces(id) on delete cascade, property_id text not null, verified integer not null default 0);
create table if not exists outbox (
  id bigserial primary key, workspace_id text, channel text not null, recipient text not null, subject text, body text,
  html text, status text not null, provider text, provider_id text, error text, meta text, created_at bigint not null);
create table if not exists leads (
  id bigserial primary key, kind text not null, email text, name text, data text, created_at bigint not null);
create table if not exists payments (
  id text primary key, workspace_id text not null, booking_id text not null, kind text not null, amount integer not null,
  status text not null, provider_ref text, created_at bigint not null, updated_at bigint not null);
create table if not exists secrets (workspace_id text not null, name text not null, value text not null, updated_at bigint not null, primary key (workspace_id, name));
create table if not exists resets (token text primary key, user_id text not null, expires_at bigint not null);
create table if not exists lead_seq (lead_id bigint primary key, seq text not null, idx integer not null default 0, status text not null,
  next_at bigint, sent text not null default '{}', vars text not null default '{}', updated_at bigint not null);
create table if not exists lead_optout (email text primary key, at bigint not null);
create table if not exists kv (k text primary key, v text not null);
create index if not exists lead_seq_due on lead_seq(status, next_at);
create index if not exists outbox_ws on outbox(workspace_id, created_at);
create index if not exists pay_ws on payments(workspace_id, booking_id);
`;
