alter table public.readings
add column if not exists chlorination_power_kwh numeric;
