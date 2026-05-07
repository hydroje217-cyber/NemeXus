do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chlorination_readings'
    ) then
      alter publication supabase_realtime add table public.chlorination_readings;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'deepwell_readings'
    ) then
      alter publication supabase_realtime add table public.deepwell_readings;
    end if;
  end if;
end $$;
