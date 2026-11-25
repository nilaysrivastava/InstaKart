-- Public demo identities have no access to durable commerce data, even via the
-- Data API or a direct checkout RPC. The Node server supplies sample workspaces.
create or replace function private.is_demo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = auth.uid() and raw_app_meta_data->>'demo' = 'true');
$$;
revoke all on function private.is_demo() from public, anon;
grant execute on function private.is_demo() to authenticated;
drop policy if exists demo_isolation on public.commerce_entities;
create policy demo_isolation on public.commerce_entities as restrictive for all to authenticated
  using (not (select private.is_demo())) with check (not (select private.is_demo()));

-- SECURITY DEFINER checkout bypasses RLS, so reject demo writes at the table too.
create or replace function private.reject_demo_commerce_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_demo() then raise exception 'Public demo accounts use the isolated demo workspace'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.reject_demo_commerce_write() from public, anon, authenticated;
drop trigger if exists reject_demo_commerce_write on public.commerce_entities;
create trigger reject_demo_commerce_write before insert or update or delete on public.commerce_entities
  for each row execute function private.reject_demo_commerce_write();

-- Prevent a visitor from locking everyone else out of a published demo account.
create or replace function private.protect_demo_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.raw_app_meta_data->>'demo' = 'true' and current_user = 'supabase_auth_admin' and
    (new.email is distinct from old.email or new.encrypted_password is distinct from old.encrypted_password
     or new.email_change is distinct from old.email_change) then
    raise exception 'Public demo credentials cannot be changed';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_demo_identity() from public, anon, authenticated;
drop trigger if exists protect_demo_identity on auth.users;
create trigger protect_demo_identity before update on auth.users
  for each row execute function private.protect_demo_identity();
