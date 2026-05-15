import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n.jsx';

const FONT_KEY = 'fammy.fontSize';
const CONTRAST_KEY = 'fammy.highContrast';
const MOTION_KEY = 'fammy.reducedMotion';

export function applyA11ySettings() {
  const root = document.documentElement;
  try {
    const fontSize = localStorage.getItem(FONT_KEY) || 'normal';
    const fontMap = { normal: '16px', large: '18px', xlarge: '20px' };
    root.style.fontSize = fontMap[fontSize] || '16px';
    root.setAttribute('data-font-size', fontSize);

    const highContrast = localStorage.getItem(CONTRAST_KEY) === 'true';
    if (highContrast) root.setAttribute('data-high-contrast', 'true');
    else root.removeAttribute('data-high-contrast');

    const reducedMotion = localStorage.getItem(MOTION_KEY) === 'true';
    if (reducedMotion) root.setAttribute('data-reduced-motion', 'true');
    else root.removeAttribute('data-reduced-motion');
  } catch {}
}

export default function AccessibilityScreen({ onBack }) {
  const { t } = useT();
  const [fontSize, setFontSize] = useState(() => {
    try { return localStorage.getItem(FONT_KEY) || 'normal'; } catch { return 'normal'; }
  });
  const [highContrast, setHighContrast] = useState(() => {
    try { return localStorage.getItem(CONTRAST_KEY) === 'true'; } catch { return false; }
  });
  const [reducedMotion, setReducedMotion] = useState(() => {
    try { return localStorage.getItem(MOTION_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(FONT_KEY, fontSize); } catch {}
    applyA11ySettings();
  }, [fontSize]);

  useEffect(() => {
    try { localStorage.setItem(CONTRAST_KEY, String(highContrast)); } catch {}
    applyA11ySettings();
  }, [highContrast]);

  useEffect(() => {
    try { localStorage.setItem(MOTION_KEY, String(reducedMotion)); } catch {}
    applyA11ySettings();
  }, [reducedMotion]);

  const sizes = [
    { id: 'normal',  label: t('a11y_font_normal') },
    { id: 'large',   label: t('a11y_font_large') },
    { id: 'xlarge',  label: t('a11y_font_xlarge') },
  ];

  return (
    <div className="profile-wrap">
      <button className="link-btn" onClick={onBack} style={{ marginBottom: 12 }}>{t('profile_back')}</button>
      <h1 className="profile-h">{t('a11y_h')}</h1>
      <p style={{ color: 'var(--km)', textAlign: 'center', marginTop: -16, marginBottom: 24 }}>
        {t('a11y_sub')}
      </p>

      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>{t('a11y_font_size')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sizes.map((s) => (
            <button key={s.id} onClick={() => setFontSize(s.id)}
              style={{
                padding: '8px 14px', borderRadius: 100, border: '1.5px solid',
                borderColor: fontSize === s.id ? 'var(--k)' : 'var(--sm)',
                background: fontSize === s.id ? 'var(--sm)' : 'white',
                fontSize: 13, fontWeight: 600,
              }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ToggleRow
        label={t('a11y_high_contrast')}
        desc={t('a11y_high_contrast_desc')}
        checked={highContrast}
        onChange={setHighContrast}
      />
      <ToggleRow
        label={t('a11y_reduced_motion')}
        desc={t('a11y_reduced_motion_desc')}
        checked={reducedMotion}
        onChange={setReducedMotion}
      />
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="profile-section">
      <div className="profile-row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="profile-label">{label}</div>
          <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
        </div>
        <button onClick={() => onChange(!checked)}
          style={{
            width: 50, height: 28, borderRadius: 100,
            border: '1.5px solid', borderColor: checked ? 'var(--k)' : 'var(--sm)',
            background: checked ? 'var(--k)' : 'white',
            position: 'relative', cursor: 'pointer', flexShrink: 0,
          }}>
          <span style={{
            position: 'absolute', top: 2, left: checked ? 24 : 2,
            width: 20, height: 20, borderRadius: '50%',
            background: checked ? 'white' : 'var(--km)',
            transition: 'left .15s',
          }} />
        </button>
      </div>
    </div>
  );
}
