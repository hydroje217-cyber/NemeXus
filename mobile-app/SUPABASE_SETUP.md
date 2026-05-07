# Supabase Setup

This Expo app now expects Supabase for authentication and data storage.

## 1. Create a Supabase project

Create a project in the Supabase dashboard and copy:

- Project URL
- Publishable key

## 2. Add environment variables

Create a `.env` file in `mobile-expo` using `.env.example`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

These values are safe to expose to the client. Do not place service role keys in the Expo app.

## 3. Run the SQL schema

Open the Supabase SQL editor and run:

- [supabase/schema.sql](./supabase/schema.sql)

This creates:

- `profiles`
- `sites`
- `site_assignments`
- `readings`
- `reading_audit_log`
- row level security policies
- a trigger to create and update profile rows from auth users
- operator approval fields so managers/supervisors can approve access
- a role-based policy setup so office accounts can review registrations and readings from the web dashboard

## 4. Create users

Users can sign up from the Expo app.

Before testing registration, disable email confirmation in Supabase so office approval is the only gate:

- open `Authentication`
- open `Providers`
- open `Email`
- turn `Confirm email` off
- save

With `Confirm email` disabled, Supabase lets the user create a session immediately after signup, and your app will block access using the office approval check in `profiles.is_approved`.

For forgot-password links, add the app redirect URL in Supabase:

- open `Authentication`
- open `URL Configuration`
- add `nemexus://reset-password` to `Redirect URLs`
- when testing with Expo Go, also add the reset URL printed by the running app environment, for example `exp://YOUR-LAN-IP:8081/--/reset-password`

The app sends reset emails using Expo's generated reset URL, so development builds, Expo Go, and production builds can each use the correct link format.

After a user signs up:

- operators stay blocked from the app until approved
- office accounts can approve them from the web dashboard

To create an office approver account:

```sql
update public.profiles
set role = 'manager'
where email = 'office@example.com';
```

Once an account has role `manager`, `supervisor`, or `admin`:

- sign in through the Expo web app with `npm run web`
- the account lands on the office dashboard automatically
- only `admin` can approve pending operator registrations
- recent readings and operator activity are visible from the same database
- `manager` and `supervisor` are limited to readings access
- if the account is `admin`, it can also promote other accounts to `manager`, `supervisor`, or `admin` from the dashboard

## 5. Optional admin role

For the very first admin account, do a one-time bootstrap in SQL:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@example.com';
```

Recommended bootstrap:

```sql
update public.profiles
set role = 'admin',
    is_approved = true,
    approved_at = now()
where email = 'admin@example.com';
```

After the first admin signs in, future office/admin accounts can be promoted from the admin dashboard instead of editing the table manually.

## 6. Run the app

```bash
npm start
npm run web
```

## Notes

- The logged-in user is the submitting operator.
- Approved users can choose Site 1 or Site 2 in the app.
- New operators are blocked until office staff approve them from the dashboard.
- `site_assignments` remains in the schema for future role expansion, but the current app flow does not require it.
- If you already ran the older schema, run:
  - `supabase/open-site-selection.sql`
  - `supabase/approval-workflow.sql`
  - `supabase/admin-role-management.sql`
