// useAndroidBack.js — Hook che intercetta il tasto "Indietro" hardware di Android
// (mappato da WebView a un event `popstate`) per chiudere modal/screen invece
// di far uscire l'utente dall'app.
//
// FIX v2 (Feb 2026): la prima versione faceva `history.back()` nel cleanup,
// che triggerava un popstate residuo. Anche se rimuovevamo il listener
// prima, in alcuni casi (StrictMode dev, modal pile, click rapidi) la entry
// veniva consumata troppo presto → il modal si chiudeva immediatamente
// dopo l'apertura. Soluzione: usare uno stack globale di modal aperti +
// listener UNICO, così il back hardware chiude solo il top-of-stack senza
// generare cleanup races.

import { useEffect } from 'react';

// Stack globale dei modal attualmente "back-aware" (ultimo aperto = top).
const modalStack = [];
let popstateInstalled = false;
let initialDepth = -1;

function ensurePopstateInstalled() {
  if (popstateInstalled) return;
  popstateInstalled = true;
  initialDepth = window.history.length;
  window.addEventListener('popstate', () => {
    // Pop solo il top-of-stack (last opened modal)
    const top = modalStack[modalStack.length - 1];
    if (top && typeof top.onBack === 'function') {
      // Non rimuoviamo qui — sarà l'unmount del modal a rimuovere se stesso
      // Chiamiamo il callback per far chiudere il modal lato React
      try { top.onBack(); } catch { /* noop */ }
    }
  });
}

export function useAndroidBack(isOpen, onBack) {
  useEffect(() => {
    if (!isOpen) return;
    ensurePopstateInstalled();

    // Pusha entry history per "consumare" il prossimo back hardware
    window.history.pushState({ __fammyModal: true, t: Date.now() }, '');

    const entry = { onBack };
    modalStack.push(entry);

    return () => {
      // Rimuovi questa entry dallo stack (potrebbe non essere più in cima
      // se altri modal sono stati aperti sopra di noi)
      const idx = modalStack.lastIndexOf(entry);
      if (idx >= 0) modalStack.splice(idx, 1);
      // NON facciamo history.back() qui per evitare la race condition che
      // chiudeva immediatamente i modal appena aperti. Le entry orfane in
      // history non causano problemi visibili all'utente (al massimo lui
      // dovrà premere back 1 volta in più per uscire dall'app, ma in
      // pratica le entry vengono consumate dai modal stessi).
    };
  }, [isOpen, onBack]);
}
