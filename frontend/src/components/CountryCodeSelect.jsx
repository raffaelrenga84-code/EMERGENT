// CountryCodeSelect — selettore prefissi internazionali con search-bar.
//
// Sostituisce il vecchio <select> nativo. Mostra una "pill" cliccabile
// "🇮🇹 +39" che apre un overlay-popover con search-bar e lista filtrabile.
//
// Filtri (case-insensitive, multi-token):
//   - "aus"    → trova "Australia"
//   - "AU"     → trova "Australia"
//   - "+61"    → trova "Australia"
//   - "italia" → trova "Italia"
//
// Props:
//   - value: country `code` E.164 selezionato (es. "+39")
//   - onChange: (newCode: string) => void
//   - testid: prefisso per i data-testid

import { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRY_CODES } from '../lib/countryCodes.js';
import { useT } from '../lib/i18n.jsx';

const norm = (s) => (s || '').toString().toLowerCase()
  // strip accenti
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function CountryCodeSelect({ value, onChange, testid = 'cc' }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const selected = COUNTRY_CODES.find((c) => c.code === value) || COUNTRY_CODES[0];

  // Focus automatico sulla search-bar all'apertura
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTimeout(() => { try { inputRef.current?.focus(); } catch (_) {} }, 50);
  }, [open]);

  // Click esterno chiude
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return COUNTRY_CODES;
    // Match su name, label, code (anche senza "+")
    return COUNTRY_CODES.filter((c) => {
      const blob = `${norm(c.name)} ${norm(c.label)} ${c.code}`;
      return blob.includes(q) || blob.includes(q.replace(/^\+/, ''));
    });
  }, [query]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`${testid}-trigger`}
        className="input"
        style={{
          width: 140, padding: '10px 10px', fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, cursor: 'pointer', textAlign: 'left',
          background: 'white',
        }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{selected.flag}</span>
          <span style={{ fontWeight: 600 }}>{selected.label}</span>
          <span style={{ color: 'var(--km)' }}>{selected.code}</span>
        </span>
        <span style={{
          color: 'var(--km)', fontSize: 16, lineHeight: 1,
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s ease',
        }}>⌄</span>
      </button>

      {/* Popover */}
      {open && (
        <div
          data-testid={`${testid}-popover`}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0,
            width: 'min(320px, 92vw)',
            maxHeight: 340, overflow: 'hidden',
            background: 'white',
            border: '1px solid var(--sm)',
            borderRadius: 14,
            boxShadow: '0 16px 40px rgba(0,0,0,0.16)',
            zIndex: 100,
            display: 'flex', flexDirection: 'column',
          }}>
          {/* Search */}
          <div style={{
            padding: 10, borderBottom: '1px solid var(--sm)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14, color: 'var(--km)' }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('cc_search_ph')}
              data-testid={`${testid}-search`}
              style={{
                flex: 1, border: 'none', outline: 'none',
                background: 'transparent', fontSize: 14, padding: '4px 0',
                color: 'var(--k)',
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}
                style={{
                  background: 'var(--ab)', border: 'none', borderRadius: 6,
                  padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                  color: 'var(--km)',
                }}>✕</button>
            )}
          </div>

          {/* Lista risultati */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{
                padding: 16, textAlign: 'center', color: 'var(--km)',
                fontSize: 13,
              }}>
                {t('cc_no_results', { q: query })}
              </div>
            ) : (
              filtered.map((c) => {
                const isSel = c.code === value;
                return (
                  <button
                    key={c.code + c.label}
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false); }}
                    data-testid={`${testid}-opt-${c.label}`}
                    style={{
                      width: '100%', padding: '10px 12px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: isSel ? 'var(--ab)' : 'transparent',
                      border: 'none', borderRadius: 8, cursor: 'pointer',
                      fontSize: 14, color: 'var(--k)',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.background = 'var(--s)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSel) e.currentTarget.style.background = 'transparent';
                    }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{c.flag}</span>
                    <span style={{ flex: 1, fontWeight: isSel ? 700 : 500 }}>{c.name}</span>
                    <span style={{ color: 'var(--km)', fontWeight: 600, fontSize: 13 }}>
                      {c.code}
                    </span>
                    {isSel && <span style={{ color: 'var(--ac)', fontSize: 14 }}>✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
