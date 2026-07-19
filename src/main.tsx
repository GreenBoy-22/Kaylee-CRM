import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import RateMeal from './RateMeal';
import './styles.css';
import './gcal-calendar.css';

// Public, no-login recipe rating page — anyone with the link lands here
// directly, bypassing the authenticated Hub shell entirely.
const rateMatch = window.location.pathname.match(/^\/rate\/([^/]+)/);

// ── PWA update banner ───────────────────────────────────────────────────
// Registers the service worker and watches for a new version becoming
// available. When one is ready, shows a small floating "Update now" banner
// instead of auto-reloading — reloading mid-typing (e.g. mid touchpoint
// note) would be jarring, so this lets Kaylee choose when to pick it up.
function UpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // updateViaCache: 'none' forces the browser to bypass its own HTTP
    // cache when checking sw.js for changes — without this, a caching
    // header anywhere between the browser and Vercel can make the update
    // check itself look at a stale copy of the service worker script,
    // which is the classic cause of a PWA needing a full uninstall to
    // ever see a new version.
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
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

      // An installed PWA that's just left sitting open won't necessarily
      // re-check for updates on its own — browsers throttle background SW
      // checks fairly aggressively. Actively ask it to check whenever the
      // app regains focus (switching back to it, reopening it) and every
      // 30 minutes while it's open, so a deploy gets picked up without
      // needing to fully close and relaunch the app.
      const checkForUpdate = () => reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('focus', checkForUpdate);
      const interval = setInterval(checkForUpdate, 30 * 60 * 1000);
      return () => clearInterval(interval);
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
    {rateMatch ? (
      <RateMeal recipeId={rateMatch[1]} />
    ) : (
      <>
        <App />
        <UpdateBanner />
      </>
    )}
  </React.StrictMode>
);
