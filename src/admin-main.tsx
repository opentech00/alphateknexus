import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AdminApp } from './admin/AdminApp';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <AdminApp />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
