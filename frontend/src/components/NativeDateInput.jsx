import { useRef } from 'react';
import { useT } from '../lib/i18n.jsx';

// Map della lingua dell'app → BCP47 locale per Intl.DateTimeFormat
const LANG_TO_LOCALE = {
  it: 'it-IT', en: 'en-US', fr: 'fr-FR', de: 'de-DE',
};

/**
 * NativeDateInput — picker data/ora nativo cross-browser robusto.
 *
 * Risolve il pattern fragile "<button> + input.showPicker()" che fallisce
 * silenziosamente su Safari iOS / PWA standalone.
 *
 * Strategia: un <label> racchiude un input nativo posizionato a copertura
 * completa con opacity:0. Il tap sulla label apre il picker nativo SENZA
 * bisogno di JS, su tutti i browser e tutte le webview.
 *
 * Props:
 *  - type:        'date' | 'datetime-local' | 'time' | 'month'
 *  - value:       string (formato ISO appropriato al type)
 *  - onChange:    (newValue: string) => void
 *  - placeholder: testo mostrato quando value è vuoto
 *  - icon:        emoji singolo (default '📅')
 *  - clearable:   bool — mostra "✕" per pulire (default true)
 *  - displayFormat: (value) => string | null  — override del display
 *  - testid:      stringa per data-testid
 */
export default function NativeDateInput({
  type = 'date',
  value,
  onChange,
  placeholder = null,
  icon = '📅',
  clearable = true,
  displayFormat,
  testid,
}) {
  const ref = useRef(null);
  const { t, lang } = useT();
  const ph = placeholder ?? (t('tap_to_pick') || 'Tocca per scegliere…');
  const locale = LANG_TO_LOCALE[lang] || undefined;

  // showPicker() solo come UX boost su desktop — sulla label il browser
  // apre già il picker nativo da solo.
  const tryShowPicker = (e) => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); e.preventDefault(); } catch (_) { /* fallback label */ }
    }
  };

  const defaultDisplay = (v) => {
    if (!v) return null;
    try {
      if (type === 'date') {
        return new Date(v + 'T00:00:00').toLocaleDateString(locale, {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        });
      }
      if (type === 'datetime-local') {
        return new Date(v).toLocaleString(locale, {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });
      }
      if (type === 'time') return v;
      if (type === 'month') {
        return new Date(v + '-01T00:00:00').toLocaleDateString(locale, {
          month: 'long', year: 'numeric',
        });
      }
    } catch (_) { return v; }
    return v;
  };

  const display = displayFormat ? displayFormat(value) : defaultDisplay(value);

  return (
    <div style={{ position: 'relative' }}>
      <label
        data-testid={testid}
        onClick={tryShowPicker}
        style={{
          width: '100%', padding: '14px 16px',
          border: value ? '1.5px solid var(--ac)' : '1.5px solid var(--sm)',
          borderRadius: 12,
          background: value ? 'var(--ab)' : 'white',
          color: value ? 'var(--ac)' : 'var(--km)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 10,
          boxSizing: 'border-box',
        }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ flex: 1, textTransform: value ? 'capitalize' : 'none' }}>
          {display || ph}
        </span>
        {value && clearable && (
          <span role="button"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange(''); }}
            data-testid={testid ? `${testid}-clear` : undefined}
            style={{
              padding: '2px 8px', borderRadius: 100,
              background: 'white', border: '1px solid var(--sm)',
              color: 'var(--km)', fontSize: 12, fontWeight: 600,
              zIndex: 2, position: 'relative',
            }}>✕</span>
        )}
        <input ref={ref} type={type} value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ph}
          style={{
            position: 'absolute', left: 0, top: 0,
            width: '100%', height: '100%',
            opacity: 0, cursor: 'pointer',
            zIndex: 1,
          }}
        />
      </label>
    </div>
  );
}
