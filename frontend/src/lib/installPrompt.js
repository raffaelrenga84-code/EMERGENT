/**
 * installPrompt.js — utility per rilevare device, stato installazione e
 * gestire il `beforeinstallprompt` event di Android Chrome / Edge.
 *
 * Esporta:
 *  - detectDevice() → 'ios-safari' | 'android-chrome' | 'desktop-chrome' | 'ios-chrome' | 'other'
 *  - isStandalone() → boolean
 *  - capturedInstallPrompt → BeforeInstallPromptEvent | null (popolato al volo)
 *  - triggerNativeInstall() → Promise<'accepted'|'dismissed'|'unavailable'>
 *  - shouldShowA2H() → boolean (logica intervalli + dismiss)
 *  - markA2HDismissed() → void
 *  - markA2HInstalled() → void
 */

// Cattura globale BEFOREINSTALLPROMPT (chrome android/desktop).
// Va attaccato il prima possibile, prima ancora che React si monti.
let _capturedPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _capturedPrompt = e;
    // Notifica eventuali listener React
    try { window.dispatchEvent(new CustomEvent('fammy:install-prompt-ready')); } catch { /* ignore */ }
  });
  window.addEventListener('appinstalled', () => {
    _capturedPrompt = null;
    markA2HInstalled();
  });
}

export function detectDevice() {
  if (typeof navigator === 'undefined') return 'other';
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  // Safari iOS = NO Chrome / NO FxiOS / NO CriOS
  const isIOSafari = isIOS && !/crios|fxios|edgios/.test(ua) && /safari/.test(ua);
  const isIOSChrome = isIOS && /crios/.test(ua);
  const isAndroid = /android/.test(ua);
  const isAndroidChrome = isAndroid && /chrome/.test(ua) && !/edg/.test(ua);
  // Desktop Chrome / Edge (supportano beforeinstallprompt)
  const isDesktopChrome = !isIOS && !isAndroid && /chrome/.test(ua);

  if (isIOSafari) return 'ios-safari';
  if (isIOSChrome) return 'ios-chrome';
  if (isAndroidChrome) return 'android-chrome';
  if (isDesktopChrome) return 'desktop-chrome';
  return 'other';
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return !!(
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  );
}

export function isInstallPromptAvailable() {
  return _capturedPrompt !== null;
}

export async function triggerNativeInstall() {
  if (!_capturedPrompt) return 'unavailable';
  try {
    _capturedPrompt.prompt();
    const choice = await _capturedPrompt.userChoice;
    if (choice?.outcome === 'accepted') markA2HInstalled();
    _capturedPrompt = null;
    return choice?.outcome || 'dismissed';
  } catch {
    return 'dismissed';
  }
}

// ---- Storage helpers (mostra solo in momenti opportuni) ----------------------
const KEY_DISMISS = 'fammy_a2h_dismissed_at';
const KEY_INSTALLED = 'fammy_a2h_installed';
const KEY_VISIT_COUNT = 'fammy_visit_count';
const KEY_SESSION_PROMPT_SHOWN = 'fammy_session_prompt_shown';
const DISMISS_TTL_DAYS = 3;
const MIN_VISITS = 3;

/**
 * Incrementa il contatore visite. Chiamare una sola volta al boot dell'app.
 * Restituisce il count corrente.
 */
export function incrementVisitCount() {
  try {
    const cur = parseInt(localStorage.getItem(KEY_VISIT_COUNT) || '0', 10);
    const next = cur + 1;
    localStorage.setItem(KEY_VISIT_COUNT, String(next));
    return next;
  } catch { return 1; }
}

export function getVisitCount() {
  try { return parseInt(localStorage.getItem(KEY_VISIT_COUNT) || '0', 10); }
  catch { return 0; }
}

/**
 * Flag "qualche prompt mostrato in questa sessione" (sessionStorage).
 * Evita che notifiche + add-to-home appaiano insieme.
 */
export function markPromptShownThisSession() {
  try { sessionStorage.setItem(KEY_SESSION_PROMPT_SHOWN, '1'); } catch { /* ignore */ }
}

export function wasPromptShownThisSession() {
  try { return sessionStorage.getItem(KEY_SESSION_PROMPT_SHOWN) === '1'; }
  catch { return false; }
}

export function shouldShowA2H() {
  try {
    if (isStandalone()) return false;
    if (localStorage.getItem(KEY_INSTALLED) === '1') return false;
    if (wasPromptShownThisSession()) return false;       // un solo prompt per sessione
    if (getVisitCount() < MIN_VISITS) return false;       // serve essere "affezionati"
    const last = parseInt(localStorage.getItem(KEY_DISMISS) || '0', 10);
    if (!last) return true;
    const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return days >= DISMISS_TTL_DAYS;
  } catch { return false; }
}

export function markA2HDismissed() {
  try { localStorage.setItem(KEY_DISMISS, String(Date.now())); } catch { /* ignore */ }
}

export function markA2HInstalled() {
  try { localStorage.setItem(KEY_INSTALLED, '1'); } catch { /* ignore */ }
}

// ============================================================================
// Notifications prompt — logica simile ma legata a "1° task creato"
// ============================================================================
const KEY_NOTIF_DISMISS = 'fammy_notif_prompt_dismissed_at';
const KEY_NOTIF_TRIES = 'fammy_notif_prompt_tries';
const KEY_FIRST_TASK_CREATED = 'fammy_first_task_created_at';
const NOTIF_DISMISS_TTL_DAYS = 3;
const NOTIF_MAX_TRIES = 3;

export function markFirstTaskCreated() {
  try {
    if (!localStorage.getItem(KEY_FIRST_TASK_CREATED)) {
      localStorage.setItem(KEY_FIRST_TASK_CREATED, String(Date.now()));
    }
  } catch { /* ignore */ }
}

export function shouldShowNotifPrompt() {
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission !== 'default') return false;
    if (wasPromptShownThisSession()) return false;
    if (!localStorage.getItem(KEY_FIRST_TASK_CREATED)) return false;
    const tries = parseInt(localStorage.getItem(KEY_NOTIF_TRIES) || '0', 10);
    if (tries >= NOTIF_MAX_TRIES) return false;
    const last = parseInt(localStorage.getItem(KEY_NOTIF_DISMISS) || '0', 10);
    if (!last) return true;
    const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return days >= NOTIF_DISMISS_TTL_DAYS;
  } catch { return false; }
}

export function markNotifPromptDismissed() {
  try {
    localStorage.setItem(KEY_NOTIF_DISMISS, String(Date.now()));
    const tries = parseInt(localStorage.getItem(KEY_NOTIF_TRIES) || '0', 10);
    localStorage.setItem(KEY_NOTIF_TRIES, String(tries + 1));
  } catch { /* ignore */ }
}

export function markNotifPromptStopped() {
  try { localStorage.setItem(KEY_NOTIF_TRIES, String(NOTIF_MAX_TRIES)); } catch { /* ignore */ }
}
