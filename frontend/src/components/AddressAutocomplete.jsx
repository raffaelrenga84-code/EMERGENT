// AddressAutocomplete.jsx — Input con autocomplete Google Maps Places.
//
// Usa l'API programmatica `AutocompleteSuggestion` (Places API New) con un
// dropdown custom renderizzato da noi, ancorato al campo. NON usa più il web
// component `<gmp-place-autocomplete>`: il suo dropdown vive in uno shadow DOM
// con posizionamento proprio che su mobile (tastiera aperta) si stacca dal
// campo e lascia lo schermo bianco.
//
// API key letta da `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`. Se mancante
// (o se il caricamento dello script fallisce), il campo resta un semplice
// <input> editabile (graceful degradation, il Salva funziona comunque).

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
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      libraries: 'places',
      language: lang,
    });
    s.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    s.onload = () => {
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
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const tokenRef = useRef(null);      // AutocompleteSessionToken (billing per sessione)
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);         // scarta risposte stale
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((e) => console.warn('[AddressAutocomplete] Google Maps non disponibile:', e.message));
    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchSuggestions = async (input) => {
    const myId = ++reqIdRef.current;
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } =
        await window.google.maps.importLibrary('places');
      if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
      const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: tokenRef.current,
        language: (navigator.language || 'it').split('-')[0],
      });
      if (myId !== reqIdRef.current) return; // risposta vecchia, ignora
      const list = (results || []).filter((s) => s.placePrediction).slice(0, 5);
      setSuggestions(list);
      setOpen(list.length > 0);
    } catch (e) {
      console.warn('[AddressAutocomplete] suggestions error:', e.message);
      if (myId === reqIdRef.current) { setSuggestions([]); setOpen(false); }
    }
  };

  const handleInput = (e) => {
    const v = e.target.value;
    onChange?.(v);
    if (!ready) return;
    clearTimeout(debounceRef.current);
    if (v.trim().length < 3) {
      reqIdRef.current++; // invalida fetch in corso
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(v.trim()), 250);
  };

  const handleSelect = async (suggestion) => {
    const pred = suggestion.placePrediction;
    setOpen(false);
    setSuggestions([]);
    clearTimeout(debounceRef.current);
    reqIdRef.current++;
    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'id'] });
      const formatted = place.formattedAddress || pred.text?.text || '';
      const loc = place.location;
      const lat = typeof loc?.lat === 'function' ? loc.lat()
        : (typeof loc?.lat === 'number' ? loc.lat
        : (typeof loc?.latitude === 'number' ? loc.latitude : null));
      const lng = typeof loc?.lng === 'function' ? loc.lng()
        : (typeof loc?.lng === 'number' ? loc.lng
        : (typeof loc?.longitude === 'number' ? loc.longitude : null));
      onChange?.(formatted);
      onSelect?.({
        formattedAddress: formatted,
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        placeId: place.id || null,
      });
    } catch (e) {
      console.warn('[AddressAutocomplete] place fetch error:', e.message);
      const txt = pred.text?.text || '';
      onChange?.(txt);
      onSelect?.({ formattedAddress: txt, lat: null, lng: null, placeId: null });
    }
    // La sessione di billing si chiude con una selezione: nuovo token alla prossima digitazione
    tokenRef.current = null;
    inputRef.current?.blur();
  };

  const handleFocus = () => {
    if (suggestions.length > 0) setOpen(true);
    // Mobile: dopo l'apertura della tastiera, porta il campo a metà schermo
    // così il dropdown ha spazio sotto e niente salti di layout.
    setTimeout(() => {
      wrapRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300);
  };

  const handleBlur = () => {
    // Delay per permettere il tap su un suggerimento (che fa preventDefault
    // sul mousedown, ma alcuni browser mobili emettono comunque blur)
    setTimeout(() => setOpen(false), 150);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        ref={inputRef}
        type="text"
        className="input"
        data-testid={testid}
        placeholder={placeholder}
        value={value}
        onChange={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        style={{ width: '100%', boxSizing: 'border-box' }}
      />
      {open && suggestions.length > 0 && (
        <div
          role="listbox"
          data-testid={`${testid}-dropdown`}
          onMouseDown={(e) => e.preventDefault()} /* non far perdere il focus all'input */
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 80,
            background: 'var(--s)',
            border: '1.5px solid var(--sd)',
            borderRadius: 13,
            boxShadow: '0 10px 28px rgba(0,0,0,.14)',
            maxHeight: 250,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}>
          {suggestions.map((s, i) => {
            const pred = s.placePrediction;
            const main = pred.mainText?.text || pred.text?.text || '';
            const secondary = pred.secondaryText?.text || '';
            return (
              <button
                key={pred.placeId || i}
                type="button"
                data-testid={`${testid}-suggestion-${i}`}
                onClick={() => handleSelect(s)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '11px 14px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                  borderBottom: i < suggestions.length - 1 ? '1px solid var(--sm)' : 'none',
                }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--k)', lineHeight: 1.3 }}>
                  📍 {main}
                </div>
                {secondary && (
                  <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2, lineHeight: 1.3 }}>
                    {secondary}
                  </div>
                )}
              </button>
            );
          })}
          {/* Attribution richiesta dai ToS Google quando i risultati non sono su una mappa */}
          <div style={{
            padding: '6px 14px', fontSize: 10, color: 'var(--kl)',
            textAlign: 'right', borderTop: '1px solid var(--sm)',
          }}>
            powered by Google
          </div>
        </div>
      )}
    </div>
  );
}
