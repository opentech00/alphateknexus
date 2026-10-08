import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MissingConfigScreen } from './components/MissingConfigScreen';
import { applySafeAreaFallback } from './lib/safeArea';
import { isSupabaseConfigured } from './lib/supabase';
import './index.css';

applySafeAreaFallback();

const rootEl = document.getElementById('root');

function markBooted() {
  if (rootEl) rootEl.setAttribute('data-booted', '1');
  document.documentElement.setAttribute('data-app-booted', '1');
}

if (!rootEl) {
  document.body.innerHTML =
    '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;text-align:center"><p>AlphaTek Nexus could not start.</p></div>';
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary homeHref="/" homeLabel="Go to home">
          {isSupabaseConfigured ? <App /> : <MissingConfigScreen appName="AlphaTek Nexus" />}
        </ErrorBoundary>
      </React.StrictMode>,
    );
    markBooted();
  } catch (err) {
    console.error('App failed to mount', err);
    rootEl.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#f5f8ff;color:#0f172a;text-align:center"><div><p style="font-weight:700;margin:0 0 8px">AlphaTek Nexus could not load</p><p style="color:#64748b;font-size:14px;margin:0 0 16px">Reload this page. If it keeps happening, update Safari and try again.</p><button onclick="location.reload()" style="background:#059669;color:#fff;border:0;border-radius:12px;padding:12px 20px;font-weight:600">Reload</button></div></div>';
    markBooted();
  }
}
