begin;

-- Legacy raw session tokens are no longer accepted; require a fresh sign-in.
update sessions set revoked_at = now() where revoked_at is null;

alter table users add column if not exists google_sub text;
create unique index if not exists users_google_sub_unique_idx
  on users (google_sub) where google_sub is not null;

alter table password_resets add column if not exists user_id text references users (id) on delete cascade;
update password_resets r
   set user_id = u.id
  from users u
 where r.user_id is null and lower(r.email::text) = lower(u.email::text);
delete from password_resets where user_id is null;
alter table password_resets alter column user_id set not null;
create index if not exists password_resets_user_idx on password_resets (user_id, created_at desc);

update users
   set must_reset_password = true, updated_at = now()
 where password_hash is not null and password_hash not like 'scrypt$%';

create table if not exists auth_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts > 0)
);
alter table auth_rate_limits enable row level security;

create or replace view api_usage_monthly
  with (security_invoker = true)
  as select
    api_key_id,
    date_trunc('month', created_at) as month,
    count(*)::integer as used_this_month
  from api_usage
  group by 1, 2;

do $$
declare table_name text;
begin
  for table_name in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all privileges on table public.%I from public', table_name);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all privileges on table public.%I from anon', table_name);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all privileges on table public.%I from authenticated', table_name);
    end if;
  end loop;

  for table_name in
    select sequencename from pg_sequences where schemaname = 'public'
  loop
    execute format('revoke all privileges on sequence public.%I from public', table_name);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all privileges on sequence public.%I from anon', table_name);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all privileges on sequence public.%I from authenticated', table_name);
    end if;
  end loop;
end;
$$;

revoke all privileges on api_usage_monthly from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all privileges on api_usage_monthly from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all privileges on api_usage_monthly from authenticated;
  end if;
end;
$$;

do $$
declare function_oid oid;
begin
  for function_oid in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all privileges on function public.%I(%s) from public',
                   p.proname, pg_get_function_identity_arguments(p.oid))
      from pg_proc p where p.oid = function_oid;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all privileges on function public.%I(%s) from anon',
                     p.proname, pg_get_function_identity_arguments(p.oid))
        from pg_proc p where p.oid = function_oid;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all privileges on function public.%I(%s) from authenticated',
                     p.proname, pg_get_function_identity_arguments(p.oid))
        from pg_proc p where p.oid = function_oid;
    end if;
  end loop;
end;
$$;

drop policy if exists showcases_public_read on showcases;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    create policy showcases_public_read on showcases
      for select to anon
      using (published and created_at > now() - interval '30 days');
    grant select on showcases to anon;
  end if;
end;
$$;

commit;
