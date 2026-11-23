-- Masterfilepro: replaces data/masterfile-db.json + /tmp writes with durable Postgres.
-- All access goes through serverless functions using the service-role key;
-- RLS is enabled everywhere with default-deny so a leaked anon key reads nothing.

create extension if not exists citext;

create table if not exists users (
  id                  text primary key,
  email               citext unique not null,
  name                text not null default '',
  avatar              text,
  provider            text not null default 'email' check (provider in ('email', 'google')),
  role                text not null default 'user' check (role in ('admin', 'sub-admin', 'user')),
  subscription_tier   text not null default 'standard' check (subscription_tier in ('standard', 'pro')),
  pro_status          text not null default 'none' check (pro_status in ('none', 'pending', 'active')),
  unlocked_tools      text[] not null default '{}',
  password_salt       text,
  password_hash       text,
  must_reset_password boolean not null default false,
  failed_attempts     integer not null default 0,
  locked_until        timestamptz,
  created_at          timestamptz not null default now(),
  last_login_at       timestamptz,
  updated_at          timestamptz not null default now()
);

-- Server-issued session tokens; replaces the client-held "role" header.
create table if not exists sessions (
  token       text primary key,
  user_id     text not null references users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists api_keys (
  id                  text primary key,
  name                text not null,
  provider            text not null,
  category            text,
  priority            integer not null default 1,
  enabled             boolean not null default true,
  description         text,
  dashboard_url       text,
  api_key_secret      text,
  client_secret       text,
  endpoint            text,
  monthly_quota       integer not null default 0,
  status              text not null default 'active',
  is_free_tier        boolean not null default false,
  free_credit_reset_day integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Append-only usage ledger. Monthly counters are derived, never stored,
-- so a cold start cannot reset or double-count them.
create table if not exists api_usage (
  id          bigserial primary key,
  api_key_id  text references api_keys (id) on delete set null,
  tool        text,
  user_id     text,
  status      text not null default 'success',
  created_at  timestamptz not null default now()
);
create index if not exists api_usage_key_month_idx on api_usage (api_key_id, created_at);

create view api_usage_monthly as
  select
    api_key_id,
    date_trunc('month', created_at) as month,
    count(*)::integer as used_this_month
  from api_usage
  group by 1, 2;

create table if not exists payment_gateways (
  id            text primary key,
  name          text not null,
  enabled       boolean not null default true,
  mode          text not null default 'test' check (mode in ('test', 'live')),
  public_key    text,
  secret_key    text,
  test_status   text,
  last_tested_at timestamptz,
  test_message  text,
  updated_at    timestamptz not null default now()
);

create table if not exists tools (
  key        text primary key,
  tier       text not null default 'standard' check (tier in ('standard', 'pro')),
  price      numeric(10, 2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id           bigserial primary key,
  reference    text unique not null,
  user_id      text references users (id) on delete set null,
  email        citext,
  amount       numeric(12, 2) not null,
  currency     text not null default 'GHS',
  status       text not null default 'pending',
  gateway      text not null default 'paystack',
  tool         text,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists showcases (
  id            text primary key,
  owner_user_id text references users (id) on delete set null,
  title         text not null default '',
  published     boolean not null default true,
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Visitor passes move off localStorage so check-ins are shared and durable.
create table if not exists visitor_passes (
  id            text primary key,
  owner_user_id text references users (id) on delete set null,
  event         text not null default '',
  payload       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists visitor_checkins (
  id          bigserial primary key,
  pass_id     text references visitor_passes (id) on delete cascade,
  checked_in_by text references users (id) on delete set null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists audit_log (
  id            bigserial primary key,
  actor_user_id text,
  action        text not null,
  target        text,
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table users enable row level security;
alter table sessions enable row level security;
alter table api_keys enable row level security;
alter table api_usage enable row level security;
alter table payment_gateways enable row level security;
alter table tools enable row level security;
alter table payments enable row level security;
alter table showcases enable row level security;
alter table visitor_passes enable row level security;
alter table visitor_checkins enable row level security;
alter table audit_log enable row level security;
alter table settings enable row level security;

-- Shared showcase pages are the only anonymously readable data.
create policy showcases_public_read on showcases
  for select to anon
  using (published);
