create or replace function public.delete_profile_account(target_profile_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_profile public.profiles;
  admin_count integer;
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can delete accounts.';
  end if;

  if target_profile_id = auth.uid() then
    raise exception 'Admins cannot delete their own account from the dashboard.';
  end if;

  select *
  into deleted_profile
  from public.profiles
  where id = target_profile_id;

  if deleted_profile.id is null then
    raise exception 'Profile not found.';
  end if;

  if deleted_profile.role = 'admin' then
    select count(*)
    into admin_count
    from public.profiles
    where role = 'admin'
      and is_active = true
      and id <> target_profile_id;

    if admin_count < 1 then
      raise exception 'At least one active admin account must remain.';
    end if;
  end if;

  delete from auth.users
  where id = target_profile_id;

  if not found then
    raise exception 'Auth user not found.';
  end if;

  return deleted_profile;
end;
$$;

grant execute on function public.delete_profile_account(uuid) to authenticated;
