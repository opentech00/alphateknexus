import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { EmployeeApp } from './employee/EmployeeApp';
import { ThemeProvider } from './contexts/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <EmployeeApp />
    </ThemeProvider>
  </React.StrictMode>
);
