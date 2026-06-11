// AddressAutocomplete.jsx — Input con autocomplete Google Maps Places.
//
// Usa il NUOVO `<gmp-place-autocomplete>` Web Component (Places API New),
// non più la vecchia `google.maps.places.Autocomplete` che dal 1 marzo 2025
// non è più disponibile per i nuovi customer di Google Cloud.
//
// API key letta da `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`. Se mancante
// (o se il caricamento dello script fallisce), il componente fallback
// diventa un semplice <input> (graceful degradation).

import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'fammy-google-maps-places';
let loadingPromise = null;

function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (loadingPromise) return loadingPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY non configurata'));

  loadingPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', reject);
      return;
    }
    const lang = (navigator.language || 'it').split('-')[0];
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.async = true;
    s.defer = true;
    // Carichiamo Maps JS v=weekly con loading=async (necessario per il
    // pattern moderno importLibrary). `libraries=places` rende disponibile
    // la libreria Places API New incluso il `<gmp-place-autocomplete>`.
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      libraries: 'places',
      language: lang,
    });
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.onload = () => {
      // L'importLibrary potrebbe non essere disponibile immediatamente
      const start = Date.now();
      const check = () => {
        if (window.google?.maps?.importLibrary) return resolve(window.google);
        if (Date.now() - start > 3000) return reject(new Error('importLibrary non disponibile'));
        setTimeout(check, 50);
      };
      check();
    };
    s.onerror = () => reject(new Error('Impossibile caricare Google Maps'));
    document.head.appendChild(s);
  });
  return loadingPromise;
}

/**
 * @param {object} props
 * @param {string} props.value         — valore corrente (controlled)
 * @param {function} props.onChange    — chiamato con (formattedAddress) ad ogni keystroke
 * @param {function} props.onSelect    — chiamato con ({ formattedAddress, lat, lng, placeId }) alla selezione
 * @param {string} [props.placeholder]
 * @param {string} [props.testid]
 */
export default function AddressAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Via, città…',
  testid = 'address-autocomplete',
}) {
  const containerRef = useRef(null);
  const fallbackInputRef = useRef(null);
  const elementRef = useRef(null);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    if (loadErr) return;
    let cancelled = false;
    let pacEl = null;

    (async () => {
      try {
        const google = await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;
        if (elementRef.current) return; // già inizializzato

        // Importa la libreria places (Places API New)
        await google.maps.importLibrary('places');

        pacEl = document.createElement('gmp-place-autocomplete');
        pacEl.setAttribute('placeholder', placeholder);
        // Pre-fill se c'è già un valore
        if (value) {
          // gmp-place-autocomplete espone un input interno: settiamo il valore
          // dopo un brief delay perché l'inizializzazione del web component
          // potrebbe non aver popolato lo shadow root ancora.
          setTimeout(() => {
            const inner = pacEl.querySelector('input') || pacEl.shadowRoot?.querySelector('input');
            if (inner) inner.value = value;
          }, 50);
        }
        // Override styles per matcharci col design FAMMY
        pacEl.style.width = '100%';
        pacEl.style.display = 'block';
        pacEl.style.boxSizing = 'border-box';

        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(pacEl);
        elementRef.current = pacEl;

        // Listener selezione
        pacEl.addEventListener('gmp-select', async (event) => {
          try {
            const placePrediction = event.placePrediction;
            if (!placePrediction) return;
            const place = placePrediction.toPlace();
            await place.fetchFields({
              fields: ['formattedAddress', 'location', 'displayName', 'id'],
            });
            const formatted = place.formattedAddress || place.displayName || '';
            const lat = place.location?.lat?.();
            const lng = place.location?.lng?.();
            onChange?.(formatted);
            onSelect?.({
              formattedAddress: formatted,
              lat: typeof lat === 'number' ? lat : null,
              lng: typeof lng === 'number' ? lng : null,
              placeId: place.id || null,
            });
          } catch (selErr) {
            console.warn('[AddressAutocomplete] place select error:', selErr);
          }
        });

        // Listener su input (per keystroke iniziali, prima della selezione)
        const innerInput = pacEl.querySelector('input') || pacEl.shadowRoot?.querySelector('input');
        if (innerInput) {
          innerInput.addEventListener('input', (e) => onChange?.(e.target.value));
        }
      } catch (e) {
        console.warn('[AddressAutocomplete] fallback to plain input:', e.message);
        if (!cancelled) setLoadErr(true);
      }
    })();

    return () => {
      cancelled = true;
      if (pacEl && pacEl.parentNode) {
        pacEl.parentNode.removeChild(pacEl);
      }
      elementRef.current = null;
    };
  }, [loadErr]);  

  if (loadErr) {
    // Fallback: plain input se Google Maps non si è caricato
    return (
      <input
        ref={fallbackInputRef}
        type="text"
        data-testid={testid}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        autoComplete="off"
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          border: '1px solid var(--sm)', fontSize: 14,
          background: 'white', color: 'var(--ac)', boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid={testid}
      style={{
        width: '100%',
      }}
    />
  );
}
