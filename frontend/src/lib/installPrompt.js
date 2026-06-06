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
const DISMISS_TTL_DAYS = 7;

export function shouldShowA2H() {
  try {
    if (isStandalone()) return false;
    if (localStorage.getItem(KEY_INSTALLED) === '1') return false;
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
