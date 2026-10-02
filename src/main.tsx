import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AccessGate from './components/AccessGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessGate><App /></AccessGate>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA support is optional; the app remains fully functional without it.
    });
  });
}
