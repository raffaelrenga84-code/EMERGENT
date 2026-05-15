import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * CookieConsentBanner — GDPR-compliant consent banner.
 *
 * - Persists the user's choice in localStorage ("fammy_consent": "all" | "essential")
 * - "all"        → analytics enabled (Vercel Web Analytics, etc.)
 * - "essential"  → only strictly-necessary cookies (auth/session)
 * - Banner is hidden until the I18n provider hydrates so we don't flash English copy
 * - Re-openable via window.dispatchEvent(new Event('fammy:openConsent'))
 *
 * The parent (App.jsx) reads the consent and conditionally renders the
 * analytics component, so this banner only stores the user intent.
 */

const STORAGE_KEY = 'fammy_consent';

export function getConsent() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
}

export default function CookieConsentBanner({ onChange, onOpenPrivacy }) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!getConsent());
    const handler = () => setVisible(true);
    window.addEventListener('fammy:openConsent', handler);
    return () => window.removeEventListener('fammy:openConsent', handler);
  }, []);

  const save = (value) => {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
    setVisible(false);
    onChange && onChange(value);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-labelledby="cookie-h" data-testid="cookie-banner">
      <div className="cookie-banner-inner">
        <div>
          <h3 id="cookie-h" className="cookie-h">🍪 {t('cookie_h')}</h3>
          <p className="cookie-p">
            {t('cookie_body')}{' '}
            <button
              type="button"
              className="cookie-link"
              onClick={() => onOpenPrivacy && onOpenPrivacy()}
              data-testid="cookie-open-privacy"
            >
              {t('cookie_read_more')}
            </button>
          </p>
        </div>
        <div className="cookie-actions">
          <button
            type="button"
            className="btn secondary cookie-btn"
            onClick={() => save('essential')}
            data-testid="cookie-essential-only"
          >
            {t('cookie_essential_only')}
          </button>
          <button
            type="button"
            className="btn cookie-btn"
            onClick={() => save('all')}
            data-testid="cookie-accept-all"
          >
            {t('cookie_accept_all')}
          </button>
        </div>
      </div>
    </div>
  );
}
