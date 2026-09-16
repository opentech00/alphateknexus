import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { EmployeeApp } from './employee/EmployeeApp';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MissingConfigScreen } from './components/MissingConfigScreen';
import { isSupabaseConfigured } from './lib/supabase';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary homeHref="/employee" homeLabel="Back to employee portal">
      {isSupabaseConfigured ? (
        <ThemeProvider>
          <EmployeeApp />
        </ThemeProvider>
      ) : (
        <MissingConfigScreen appName="Employee portal" />
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
