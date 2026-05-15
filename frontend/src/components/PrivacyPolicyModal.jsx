import { X } from 'lucide-react';
import { useT } from '../lib/i18n.jsx';

/**
 * PrivacyPolicyModal — Full privacy policy rendered as a modal.
 *
 * The policy text lives in i18n.jsx (4 languages) so the document follows
 * the user's UI language. Keep the sections in sync across IT/EN/FR/DE.
 */
export default function PrivacyPolicyModal({ onClose }) {
  const { t } = useT();

  return (
    <div className="modal-bg" data-testid="privacy-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <h2 style={{ flex: 1 }}>{t('privacy_h')}</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="privacy-close"
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: 'var(--sm)', color: 'var(--km)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title={t('close')}
          ><X size={18} /></button>
        </div>
        <p className="modal-sub" style={{ marginBottom: 16 }}>{t('privacy_lastupdate')} 2026-05-15</p>

        <div
          className="privacy-body"
          dangerouslySetInnerHTML={{ __html: t('privacy_body_html') }}
        />

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--sd)' }}>
          <button type="button" className="btn full" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
