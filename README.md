# NemeXus

NemeXus is split into two separate apps that share one Supabase backend.

```text
NemeXus/
  mobile-app/          # Expo React Native operator app
  manager-dashboard/   # React web dashboard for manager, supervisor, and admin users
```

## Mobile App

```bash
cd mobile-app
npm start
```

## Manager Dashboard

```bash
cd manager-dashboard
npm install
npm run dev
```

The dashboard uses the same Supabase project as the mobile app. Local environment values are stored in `manager-dashboard/.env`, with a template in `manager-dashboard/.env.example`.

Dashboard source is organized by screens:

```text
manager-dashboard/src/
  App.jsx
  main.jsx
  lib/
  screens/
  services/
  styles.css
```

## Supabase

Database schema and setup notes remain with the mobile app:

- `mobile-app/SUPABASE_SETUP.md`
- `mobile-app/supabase/`

Both apps should use the public Supabase URL and anon/publishable key. Do not place a service role key in either client app.

To preview the dashboard with fuller fake data, run `mobile-app/supabase/reset-dashboard-data.sql` and then `mobile-app/supabase/seed-dashboard-demo-data.sql` in the Supabase SQL editor after creating at least one user account.
