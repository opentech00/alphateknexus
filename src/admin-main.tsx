import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AdminApp } from './admin/AdminApp';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MissingConfigScreen } from './components/MissingConfigScreen';
import { isSupabaseConfigured } from './lib/supabase';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary homeHref="/admin" homeLabel="Back to admin">
      {isSupabaseConfigured ? (
        <AuthProvider>
          <ThemeProvider>
            <AdminApp />
          </ThemeProvider>
        </AuthProvider>
      ) : (
        <MissingConfigScreen appName="Admin panel" />
      )}
    </ErrorBoundary>
  </StrictMode>
);
