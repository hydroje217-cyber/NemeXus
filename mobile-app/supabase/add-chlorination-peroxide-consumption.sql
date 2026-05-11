alter table public.readings
add column if not exists peroxide_consumption numeric;

alter table public.chlorination_readings
add column if not exists peroxide_consumption numeric;
