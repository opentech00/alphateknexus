# AlphaTek Nexus

A multi-service business management platform with client portal, employee portal, field staff app, and admin panel.

## Prerequisites

- **Node.js 24.x** — download from https://nodejs.org/ (matches Vercel production)
- **npm** (comes with Node.js)

## Quick Start (Web)

1. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

   Then fill in real values from the Supabase dashboard. Do not commit `.env`.

2. Install dependencies:

   ```bash
   npm ci
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:5173`.

4. Build for production:

   ```bash
   npm run build
   ```

   This outputs to the `dist/` folder.

## Environment Variables

Create a local `.env` from `.env.example`. Required client variables:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anonymous/publishable key
- `VITE_MAPBOX_ACCESS_TOKEN` — Mapbox public token (`pk.`). Restrict it by URL in the Mapbox dashboard. Also set `MAPBOX_ACCESS_TOKEN` as a Supabase Edge Function secret so address search and driving directions use Mapbox.

Never put `SUPABASE_SERVICE_ROLE_KEY` or Monime secrets in Vercel or any `VITE_*` variable.

Production is deployed on **Vercel**. See [docs/vercel-production.md](docs/vercel-production.md) for env vars and pretty URLs (`/admin`, `/employee`, `/field`).

## App Entry Points

The project has four separate web apps, each with its own HTML entry point:

| App | URL Path | Description |
|------|----------|-------------|
| Client Portal | `/` (index.html) | Customer-facing booking and services |
| Admin Panel | `/admin` (admin.html) | Full management dashboard |
| Employee Portal | `/employee` (employee.html) | Employee dashboard and cash collections |
| Field Staff App | `/field` (field.html) | Mobile field staff interface (jobs, attendance, GPS) |

During development, visit `http://localhost:5173/employee.html` or `http://localhost:5173/field.html` to access the employee and field apps directly.

## Scripts

```bash
npm run dev          # Vite dev server
npm run typecheck    # TypeScript project build
npm run lint         # ESLint
npm run build        # typecheck + production bundle
```

## Android and Google Play

The Android app is the Capacitor shell around this web build. Package id: `com.alphateknexus.app`. The launcher opens the client portal. Employee, field, and admin pages are in the same bundle.

1. **Install prerequisites:**
   - **Java JDK 17** — download from https://adoptium.net/
   - **Android Studio** — download from https://developer.android.com/studio
   - **Android SDK 36** — install it from Android Studio's SDK Manager. Play requires target API 36.

2. **Set environment variables:**
   - macOS/Linux:
     ```bash
     export JAVA_HOME=/path/to/jdk-17
     export ANDROID_HOME=/path/to/Android/Sdk
     ```
   - Windows PowerShell:
     ```powershell
     $env:JAVA_HOME="C:\Program Files\Java\jdk-17"
     $env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
     ```

3. **Put production client env in `.env` before any Android build.** Vite bakes these into the app:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_MAPBOX_ACCESS_TOKEN`

   Never put `SUPABASE_SERVICE_ROLE_KEY` in `.env` or any `VITE_*` variable.

4. **Debug on a device or emulator:**
   ```bash
   npm run cap:sync
   npm run cap:open
   npm run cap:run
   ```

5. **Create the Play upload key once** (keep the file outside git):
   ```powershell
   keytool -genkeypair -v -keystore alphatek-upload.keystore -alias alphatek -keyalg RSA -keysize 2048 -validity 10000
   ```
   Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in the store path, alias, and passwords. `android/keystore.properties` and `*.keystore` are gitignored.

6. **Build the Play App Bundle.** Raise `versionCode` in `android/app/build.gradle` before every upload. `versionName` is the version users see.
   ```bash
   npm run cap:bundle
   ```
   The signed bundle is `android/app/build/outputs/bundle/release/app-release.aab` when `keystore.properties` is present.

7. **Play Console:** create the app as `com.alphateknexus.app`, turn on Play App Signing, and upload the AAB to internal testing before production. You need a public privacy policy URL. In Data safety, declare accounts, location (field jobs and cash collection), and notifications. Push stays off until `android/app/google-services.json` for this package id is added. `FCM_SERVICE_ACCOUNT_JSON` stays a Supabase Edge Function secret, not a value in the app.

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS 3, Vite 5
- **Icons:** lucide-react
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- **Hosting:** Vercel
- **PWA:** vite-plugin-pwa (client portal)
- **Mobile:** Capacitor 8 (Android)
