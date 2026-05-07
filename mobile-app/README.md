# NemeXus Mobile App

This folder is an Expo React Native app. It has two important sides:

- Client side: the code that runs on the phone or in Expo web.
- Server/database side: the Supabase project that handles auth, tables, row-level security, database functions, and stored data.

The app is intentionally kept in its current working layout so imports and Expo startup do not break.

## Folder Map

```text
mobile-app/
  App.js                 Expo root component and global providers
  index.js               Expo entry file
  src/                   Client-side mobile app code
    components/          Reusable UI pieces
    context/             Shared app state, auth, theme
    lib/                 External clients, especially Supabase
    screens/             Full app screens
    services/            Client-side database/API calls
    utils/               Pure helper logic and calculations
  supabase/              Server/database-side SQL setup
  tests/                 Node tests for pure utility logic
  docs/                  Learning notes and architecture maps
```

## Start Here

- Read [docs/CLIENT_SERVER_MAP.md](./docs/CLIENT_SERVER_MAP.md) to understand how screens, services, Supabase, and the database connect.
- Read [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) when setting up the database project.
- Start the app with `npm start` from this folder.

## Simple Mental Model

```text
Screen component
  -> calls a service function
  -> service uses the Supabase client
  -> Supabase checks auth and database policies
  -> database returns rows
  -> screen updates what the user sees
```

For example, `SubmitReadingScreen` collects the form values, then calls `createReading` in `src/services/readings.js`. That service inserts the row into either the `chlorination_readings` or `deepwell_readings` table in Supabase.
