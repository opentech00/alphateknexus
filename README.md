# AlphaTek Nexus

A multi-service business management platform with client portal, employee portal, field staff app, and admin panel.

## Prerequisites

- **Node.js** 18 or higher — download from https://nodejs.org/
- **npm** (comes with Node.js)

## Quick Start (Web)

1. **Unzip the project** and open a terminal in the project folder.

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:5173`.

4. **Build for production:**
   ```bash
   npm run build
   ```
   This outputs to the `dist/` folder.

## Environment Variables

The `.env` file is already configured with all API credentials:
- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anonymous key
- `VITE_MAPBOX_ACCESS_TOKEN` — Mapbox public token (pk.) for maps. Restrict it by URL in the Mapbox dashboard. Also set `MAPBOX_ACCESS_TOKEN` as a Supabase Edge Function secret so address search and driving directions use Mapbox.

No additional API setup is required. The database, authentication, edge functions, and file storage are all hosted on Supabase and ready to use.

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

## Android Build (Optional)

To build the Android APK:

1. **Install prerequisites:**
   - **Java JDK 17** — download from https://adoptium.net/
   - **Android Studio** — download from https://developer.android.com/studio

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

3. **Build and sync:**
   ```bash
   npm run cap:sync
   ```

4. **Open in Android Studio:**
   ```bash
   npm run cap:open
   ```

5. **Or run directly on a connected device/emulator:**
   ```bash
   npm run cap:run
   ```

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Vite
- **Icons:** lucide-react
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- **Hosting:** Vercel
- **Mobile:** Capacitor 8 (Android)
