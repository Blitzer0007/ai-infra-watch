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
  let refreshingForNewWorker = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingForNewWorker) return;
    refreshingForNewWorker = true;
    // Reload once when a new app shell takes control, so already-open tabs
    // don't keep displaying JavaScript from the previous production release.
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {
      // PWA support is optional; the app remains fully functional without it.
    }
  });
}
