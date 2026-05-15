import { useEffect } from 'react';

/**
 * useKeyboardSafeModal — su iOS/Safari (e Android Chrome) la tastiera virtuale
 * non riduce automaticamente la viewport: i nostri modal con position:fixed
 * + height:92vh finiscono coperti.
 *
 * Questo hook:
 *  1) Ascolta `visualViewport.resize` e applica un offset al bottom del
 *     modal-content scrollabile, in modo che il footer (bottoni Save/Annulla)
 *     resti SEMPRE visibile sopra la tastiera.
 *  2) Su `focus` di input/textarea dentro al ref, scrolla l'elemento
 *     focusato all'interno del container scrollable.
 *
 * Uso (in un modal):
 *   const formRef = useRef(null);
 *   useKeyboardSafeModal(formRef);
 *   return <form ref={formRef}>...</form>;
 */
export function useKeyboardSafeModal(scrollableRef) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const applyOffset = () => {
      const el = scrollableRef?.current;
      if (!el) return;
      // Differenza tra window inner height e visual viewport height = keyboard
      const kbHeight = Math.max(0, window.innerHeight - vv.height);
      // Lascia un piccolo gap sopra alla tastiera
      el.style.paddingBottom = kbHeight > 80 ? `${kbHeight - 20}px` : '';
    };

    vv.addEventListener('resize', applyOffset);
    vv.addEventListener('scroll', applyOffset);
    applyOffset();

    return () => {
      vv.removeEventListener('resize', applyOffset);
      vv.removeEventListener('scroll', applyOffset);
      const el = scrollableRef?.current;
      if (el) el.style.paddingBottom = '';
    };
  }, [scrollableRef]);

  // Scroll-into-view su focus
  useEffect(() => {
    const el = scrollableRef?.current;
    if (!el) return;
    const onFocusIn = (e) => {
      const target = e.target;
      if (!target) return;
      const tag = target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
      // Aspetta che la tastiera apra (180ms iOS)
      setTimeout(() => {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e2) {}
      }, 200);
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, [scrollableRef]);
}
