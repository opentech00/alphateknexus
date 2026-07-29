import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { FieldStaffApp } from './employee/field/FieldStaffApp';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './employee/contexts/EmployeeAuthContext';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <FieldStaffApp />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
