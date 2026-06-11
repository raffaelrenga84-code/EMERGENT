// platformDetect.js — Utility per rilevare la piattaforma del dispositivo
//
// Usato per ottimizzare la UX di input file: su iOS il picker nativo già
// mostra in automatico "Scatta foto / Libreria foto / Sfoglia", quindi
// un singolo bottone basta. Su Android invece il picker apre direttamente
// l'album e l'utente deve avere 2 bottoni separati per scegliere camera.

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // Include iPad in iOS 13+ che si maschera come Mac, ma ha touch.
  const isModernIPad = /Mac/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return /iPhone|iPad|iPod/.test(ua) || isModernIPad;
}

export function isAndroid() {
  if (typeof navigator === 'undefined') return false;
  return /Android/.test(navigator.userAgent || '');
}
