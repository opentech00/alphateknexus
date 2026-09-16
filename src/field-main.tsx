import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { FieldStaffApp } from './employee/field/FieldStaffApp';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './employee/contexts/EmployeeAuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MissingConfigScreen } from './components/MissingConfigScreen';
import { isSupabaseConfigured } from './lib/supabase';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary homeHref="/field" homeLabel="Back to field app">
      {isSupabaseConfigured ? (
        <ThemeProvider>
          <AuthProvider>
            <FieldStaffApp />
          </AuthProvider>
        </ThemeProvider>
      ) : (
        <MissingConfigScreen appName="Field staff app" />
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
