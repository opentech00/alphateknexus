import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applySafeAreaFallback } from './lib/safeArea';
import './index.css';

applySafeAreaFallback();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
