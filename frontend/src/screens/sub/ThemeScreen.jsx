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
            style={{
              border: '1.5px solid', borderColor: theme === opt.id ? 'var(--k)' : 'var(--sm)',
              background: theme === opt.id ? 'var(--sm)' : 'white',
            }}>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{opt.label}</span>
            {theme === opt.id && <span style={{ color: 'var(--gn)', fontSize: 18 }}>✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
