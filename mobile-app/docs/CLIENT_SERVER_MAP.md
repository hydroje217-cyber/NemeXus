# Client and Server Map

This app does not have a custom Node/Express backend inside the `mobile-app` folder. Instead, it uses Supabase as the backend. That means most of the code in `src/` runs on the user's device, while the backend rules and database structure live in Supabase and are represented by the SQL files in `supabase/`.

## Client Side

The client side is everything that runs in Expo React Native:

```text
src/
  NemeXusApp.js
  components/
  context/
  lib/
  screens/
  services/
  utils/
```

Important client files:

- `App.js`: wraps the app with providers like auth, theme, and safe-area handling.
- `src/NemeXusApp.js`: decides which screen to show based on auth status, user role, and route state.
- `src/screens/*`: the pages the user interacts with.
- `src/components/*`: reusable UI building blocks used by the screens.
- `src/context/AuthContext.js`: keeps track of login session, profile, sign in, sign up, password reset, and sign out.
- `src/lib/supabase.js`: creates the Supabase client using the public environment variables.
- `src/services/*`: functions that screens call when they need data.
- `src/utils/*`: pure helper logic that does not talk directly to the database.

## Server/Database Side

The backend is Supabase:

```text
supabase/
  schema.sql
  approval-workflow.sql
  admin-role-management.sql
  split-readings-by-site-type.sql
  ...
```

These SQL files describe or update the server-side database:

- Tables such as `profiles`, `sites`, `chlorination_readings`, and `deepwell_readings`.
- Database functions such as `approve_operator_account` and `assign_profile_role`.
- Row-level security policies that decide which logged-in users can read or write data.
- Demo/reset scripts for development data.

The mobile app should only use the Supabase publishable key. Do not put a Supabase service role key in this app, because client-side code is shipped to users.

## How Data Moves

### Login and profile loading

```text
User enters email/password
  -> AuthScreen calls useAuth().signIn()
  -> AuthContext calls supabase.auth.signInWithPassword()
  -> Supabase Auth validates the user
  -> AuthContext loads the matching row from profiles
  -> NemeXusApp chooses the correct screen for that user's role
```

Main files:

- `src/screens/AuthScreen.js`
- `src/context/AuthContext.js`
- `src/lib/supabase.js`
- `supabase/schema.sql`

### Site list

```text
SiteSelectionScreen loads
  -> calls listAccessibleSites()
  -> src/services/sites.js queries the sites table
  -> Supabase returns site rows
  -> screen renders the list
```

Main files:

- `src/screens/SiteSelectionScreen.js`
- `src/services/sites.js`
- `supabase/schema.sql`

### Submit a reading

```text
Operator fills reading form
  -> SubmitReadingScreen builds a payload
  -> calls createReading()
  -> src/services/readings.js picks the correct table
  -> Supabase inserts into chlorination_readings or deepwell_readings
  -> duplicate slot rules and security policies are enforced by the database
```

Main files:

- `src/screens/SubmitReadingScreen.js`
- `src/services/readings.js`
- `src/services/offlineReadings.js`
- `supabase/schema.sql`

### Office dashboard

```text
Manager/admin opens dashboard
  -> OfficeDashboardScreen calls getOfficeDashboardSnapshot()
  -> src/services/office.js runs several Supabase queries
  -> utility functions calculate totals and chart data
  -> dashboard renders approvals, readings, and production summaries
```

Main files:

- `src/screens/OfficeDashboardScreen.js`
- `src/services/office.js`
- `src/utils/production.js`
- `supabase/admin-role-management.sql`
- `supabase/approval-workflow.sql`

## Where to Make Changes

Use this guide when you are new to the app:

| Goal | Change files here |
| --- | --- |
| Change screen layout/text | `src/screens/` and `src/components/` |
| Add reusable UI | `src/components/` |
| Change login/signup behavior | `src/context/AuthContext.js` |
| Change database queries | `src/services/` |
| Change Supabase connection setup | `src/lib/supabase.js` |
| Change database tables/policies/functions | `supabase/*.sql` |
| Change calculations/charts data | `src/utils/` |

## Safe Reorganization Notes

The current structure is already separated without moving files:

- `src/` is the client app.
- `src/services/` is the client-side data access layer.
- `supabase/` is the server/database setup.

Physically moving `src/` into a new `client/` folder or moving `supabase/` into `server/` is possible, but it requires updating imports, tests, and documentation. The safer learning-friendly approach is to keep the working layout and use this map as the client/server guide.
