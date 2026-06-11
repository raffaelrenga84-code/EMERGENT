// useAndroidBack.js — Hook che intercetta il tasto "Indietro" hardware di Android
// (mappato da WebView a un event `popstate`) per chiudere modal/screen invece
// di far uscire l'utente dall'app.
//
// Pattern:
//  1. All'apertura del modal: pushState una entry "modal" nella history.
//  2. Quando l'utente preme Back: il browser triggera `popstate` e il nostro
//     handler chiama `onBack()` invece di tornare alla pagina precedente.
//  3. Allo close manuale del modal (X o backdrop): il modal stesso fa
//     `history.back()` per consumare la entry che avevamo pushato, evitando
//     che resti una entry orfana in history.
//
// Su iOS PWA Safari il pattern non interferisce: i gesti Back vivono nel
// browser-level e non triggherano popstate quando l'app è in standalone.

import { useEffect, useRef } from 'react';

export function useAndroidBack(isOpen, onBack) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    // Push una entry "modal" nella history per "consumare" il prossimo back
    window.history.pushState({ __fammyModal: true }, '');
    pushedRef.current = true;

    const handlePopState = () => {
      // L'utente ha premuto Back hardware → chiudi il modal invece di uscire
      pushedRef.current = false; // history.back ha già consumato la entry
      onBack();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Cleanup: se il modal viene chiuso programmaticamente (X click)
      // dobbiamo consumare la entry che avevamo pushato.
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [isOpen, onBack]);
}
