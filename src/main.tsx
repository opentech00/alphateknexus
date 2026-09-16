import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MissingConfigScreen } from './components/MissingConfigScreen';
import { applySafeAreaFallback } from './lib/safeArea';
import { isSupabaseConfigured } from './lib/supabase';
import './index.css';

applySafeAreaFallback();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary homeHref="/" homeLabel="Go to home">
      {isSupabaseConfigured ? <App /> : <MissingConfigScreen appName="AlphaTek Nexus" />}
    </ErrorBoundary>
  </React.StrictMode>,
);
