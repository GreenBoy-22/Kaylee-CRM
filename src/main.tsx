import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './gcal-calendar.css';

// ── PWA update banner ───────────────────────────────────────────────────
// Registers the service worker and watches for a new version becoming
// available. When one is ready, shows a small floating "Update now" banner
// instead of auto-reloading — reloading mid-typing (e.g. mid touchpoint
// note) would be jarring, so this lets Kaylee choose when to pick it up.
function UpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // A worker may already be waiting from a previous visit — e.g. this
      // tab was open when the last deploy went out.
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingWorker(reg.waiting);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // "installed" + an existing controller means this is a genuine
          // update, not the very first install on a fresh visit.
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
          }
        });
      });
    }).catch(() => {});

    // Once the new worker takes over (after we tell it to skip waiting),
    // reload exactly once to actually load the new version's assets.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);

  if (!waitingWorker) return null;

  return (
    <div
      style={{
        position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        background: '#534AB7', color: '#fff', padding: '10px 16px', borderRadius: 10,
        display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        zIndex: 9999, fontSize: 14, fontFamily: 'system-ui, sans-serif'
      }}
    >
      <span>A new version of Kaylee's Hub is ready.</span>
      <button
        onClick={() => waitingWorker.postMessage('SKIP_WAITING')}
        style={{
          background: '#fff', color: '#534AB7', border: 'none', borderRadius: 6,
          padding: '6px 12px', fontWeight: 700, cursor: 'pointer'
        }}
      >
        Update now
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <UpdateBanner />
  </React.StrictMode>
);
