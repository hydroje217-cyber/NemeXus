-- Allow approved operators to correct their own submitted split-table readings.
-- The app only exposes this action for the active slot; RLS keeps ownership enforced.

drop policy if exists "approved users can update own chlorination readings" on public.chlorination_readings;
create policy "approved users can update own chlorination readings"
on public.chlorination_readings
for update
using (
  submitted_by = auth.uid()
  and auth.uid() is not null
  and public.is_approved_user()
)
with check (
  submitted_by = auth.uid()
  and auth.uid() is not null
  and public.is_approved_user()
);

drop policy if exists "approved users can update own deepwell readings" on public.deepwell_readings;
create policy "approved users can update own deepwell readings"
on public.deepwell_readings
for update
using (
  submitted_by = auth.uid()
  and auth.uid() is not null
  and public.is_approved_user()
)
with check (
  submitted_by = auth.uid()
  and auth.uid() is not null
  and public.is_approved_user()
);
