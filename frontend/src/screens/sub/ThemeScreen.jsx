import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n.jsx';

const THEME_KEY = 'fammy.theme';

export function getCurrentTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  let actual = theme;
  if (theme === 'auto') {
    actual = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', actual);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

/**
 * Inizializza il listener globale di prefers-color-scheme. Chiamato una sola
 * volta al boot dell'app. Quando il tema è in modalità "auto" e l'utente
 * cambia il tema di sistema (es. iOS Settings → Display → Dark), FAMMY si
 * adatta in tempo reale senza richiedere reload.
 */
export function initThemeAutoListener() {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getCurrentTheme() === 'auto') applyTheme('auto');
  };
  // addEventListener moderno; fallback a addListener per Safari < 14
  if (mql.addEventListener) mql.addEventListener('change', handler);
  else if (mql.addListener) mql.addListener(handler);
}

export default function ThemeScreen({ onBack }) {
  const { t } = useT();
  const [theme, setTheme] = useState(getCurrentTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const options = [
    { id: 'light', label: t('theme_light') },
    { id: 'dark',  label: t('theme_dark') },
    { id: 'auto',  label: t('theme_auto') },
  ];

  return (
    <div className="profile-wrap">
      <button className="link-btn" onClick={onBack} style={{ marginBottom: 12 }}>{t('profile_back')}</button>
      <h1 className="profile-h">{t('theme_h')}</h1>
      <p style={{ color: 'var(--km)', textAlign: 'center', marginTop: -16, marginBottom: 24 }}>
        {t('theme_sub')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((opt) => (
          <button key={opt.id} onClick={() => setTheme(opt.id)}
            className="profile-row-btn"
            data-testid={`theme-opt-${opt.id}`}
            style={{
              border: '1.5px solid', borderColor: theme === opt.id ? 'var(--k)' : 'var(--sm)',
              background: theme === opt.id ? 'var(--sm)' : 'white',
            }}>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{opt.label}</span>
            {theme === opt.id && <span style={{ color: 'var(--gn)', fontSize: 18 }}>✓</span>}
          </button>
        ))}
      </div>

      {theme === 'auto' && (
        <p style={{
          marginTop: 16, padding: '10px 14px', borderRadius: 10,
          background: 'var(--ab)', border: '1px solid var(--sm)',
          color: 'var(--km)', fontSize: 12, lineHeight: 1.5,
        }} data-testid="theme-auto-hint">
          💡 {t('theme_auto_hint') || 'FAMMY seguirà il tema del tuo dispositivo (iOS/Android/macOS).'}
          {' '}
          <strong style={{ color: 'var(--k)' }}>
            {t('theme_auto_now') || 'Adesso'}:{' '}
            {window.matchMedia('(prefers-color-scheme: dark)').matches
              ? (t('theme_dark') || 'Scuro')
              : (t('theme_light') || 'Chiaro')}
          </strong>
        </p>
      )}
    </div>
  );
}
