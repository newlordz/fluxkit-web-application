-- Server-issued password reset codes. Codes never live in the browser.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  code_salt text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_resets_email_idx on password_resets (email, created_at desc);

alter table password_resets enable row level security;
