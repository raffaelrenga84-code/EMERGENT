// AddressAutocomplete.jsx — Input con autocomplete Google Maps Places.
//
// Carica lo script Maps JS lazy (solo quando il componente è effettivamente
// renderizzato la prima volta), così l'overhead è zero per gli utenti che
// non aprono il form indirizzo.
//
// API key letta da `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`. Se mancante,
// il componente fallback diventa un semplice <input> (graceful degradation).

import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'fammy-google-maps-places';
let loadingPromise = null;

function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.maps?.places) return Promise.resolve(window.google);
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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=${lang}&loading=async`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google);
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
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    if (loadErr) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !inputRef.current) return;
        if (autocompleteRef.current) return; // già inizializzato
        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'geometry.location', 'place_id', 'name'],
          types: ['geocode'],
        });
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const formatted = place.formatted_address || place.name || inputRef.current?.value || '';
          const lat = place.geometry?.location?.lat?.();
          const lng = place.geometry?.location?.lng?.();
          onChange?.(formatted);
          onSelect?.({
            formattedAddress: formatted,
            lat: typeof lat === 'number' ? lat : null,
            lng: typeof lng === 'number' ? lng : null,
            placeId: place.place_id || null,
          });
        });
        autocompleteRef.current = ac;
      })
      .catch((e) => {
        console.warn('[AddressAutocomplete] fallback to plain input:', e.message);
        setLoadErr(true);
      });
    return () => { cancelled = true; };
  }, [loadErr]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      ref={inputRef}
      type="text"
      data-testid={testid}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      autoComplete="off"
      style={{
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--sm)',
        fontSize: 14,
        background: 'white',
        color: 'var(--ac)',
        boxSizing: 'border-box',
      }}
    />
  );
}
