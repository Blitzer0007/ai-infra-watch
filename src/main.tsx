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
  // The first controllerchange is normal on initial install and must not
  // interrupt route navigation. Reload only when a previously controlled tab
  // receives a replacement worker after an application update.
  const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);
  let refreshingForNewWorker = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtLoad || refreshingForNewWorker) return;
    refreshingForNewWorker = true;
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
