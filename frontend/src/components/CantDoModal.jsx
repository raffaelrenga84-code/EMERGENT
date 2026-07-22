import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { APP_URL } from '../lib/appUrl.js';

/**
 * CantDoModal — "Non posso" per logistica eventi.
 * Due canali: notifica famiglia (push) + WhatsApp (testo precompilato).
 */
export default function CantDoModal({ event, members = [], session, onClose }) {
  const { t: __t0 } = useT();
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const myMember = members.find((m) => m.user_id === session?.user?.id);
  const myName = myMember?.name || 'Qualcuno';
  const eventTitle = event.title || 'Evento';

  // Formatta data/ora
  const fmtDt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('it', { weekday: 'short', day: 'numeric', month: 'short' })
      + ' ' + d.toLocaleTimeString('it', { hour: '2-digit', minute: '2-digit' });
  };
  const when = fmtDt(event.starts_at);

  // Ruolo di chi dice "non posso"
  const roles = [];
  if (myMember && myMember.id === event.transport_by) roles.push(t('ev_transport_by') || 'portare');
  if (myMember && myMember.id === event.pickup_by) roles.push(t('ev_pickup_by') || 'riprendere');
  const roleText = roles.join(' e ');

  // Push a tutta la famiglia (escluso chi scrive)
  const notifyFamily = async () => {
    setBusy(true);
    try {
      const famMembers = members.filter(
        (m) => m.family_id === (myMember?.family_id || event.family_id)
          && m.user_id && m.user_id !== session?.user?.id
      );
      const userIds = [...new Set(famMembers.map((m) => m.user_id))];
      if (userIds.length > 0) {
        await supabase.functions.invoke('send-push', {
          body: {
            user_ids: userIds,
            title: `🚨 ${myName} non può per: ${eventTitle}`,
            body: `${when} — chi può ${roleText}? Tocca per offrirsi.`,
            tag: 'cant-logistics-' + event.id,
            data: { kind: 'logistics_cant', event_id: event.id, url: '/?tab=agenda' },
          },
        });
      }
      setDone(true);
    } catch (e) {
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: (e && e.message) || 'Errore', tone: 'error' },
      }));
    }
    setBusy(false);
  };

  // WhatsApp — testo precompilato
  const openWhatsApp = () => {
    const msg = encodeURIComponent(
      `Ciao! Non riesco a ${roleText} per "${eventTitle}" (${when}).\n` +
      `Qualcuno può aiutare? Apri FAMMY per i dettagli: ${APP_URL}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        <button type="button" onClick={onClose} aria-label="Chiudi"
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: '50%',
            border: '1px solid var(--sm)', background: 'var(--s)',
            color: 'var(--km)', fontSize: 15, cursor: 'pointer',
          }}>✕</button>

        <h2 style={{ marginTop: 0, fontSize: 17 }}>❌ {t('ev_cant_do') || 'Non posso'}</h2>
        <p style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.5 }}>
          <strong>{eventTitle}</strong> · {when}<br/>
          {t('cant_role_txt') || 'Il tuo ruolo:'} <strong>{roleText}</strong>
        </p>

        {done ? (
          <div style={{ padding: '14px', background: '#F1F7EE', borderRadius: 12, textAlign: 'center', fontSize: 13 }}>
            ✅ {t('cant_family_notified') || 'Famiglia avvisata! Qualcuno risponderà a breve.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <button type="button" disabled={busy} onClick={notifyFamily}
              data-testid="cant-notify-family"
              style={{
                padding: '13px 16px', borderRadius: 14, border: 'none',
                background: 'var(--ac)', color: '#fff',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
              }}>
              <span style={{ fontSize: 22 }}>🏠</span>
              <div>
                <div>{t('cant_notify_family_btn') || 'Avvisa la famiglia'}</div>
                <div style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.85 }}>
                  {t('cant_notify_family_sub') || 'Push a tutti — chi può si offre.'}
                </div>
              </div>
            </button>

            <button type="button" onClick={openWhatsApp}
              data-testid="cant-whatsapp"
              style={{
                padding: '13px 16px', borderRadius: 14,
                border: '1.5px solid #25D366', background: 'white',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                color: '#128C7E', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
              }}>
              <span style={{ fontSize: 22 }}>💬</span>
              <div>
                <div>{t('cant_whatsapp_btn') || 'Manda su WhatsApp'}</div>
                <div style={{ fontSize: 11.5, fontWeight: 500, opacity: 0.75 }}>
                  {t('cant_whatsapp_sub') || 'Testo precompilato pronto da inviare.'}
                </div>
              </div>
            </button>

            <button type="button" onClick={onClose}
              style={{
                padding: '10px', borderRadius: 12,
                border: '1px solid var(--sm)', background: 'var(--s)',
                color: 'var(--km)', fontSize: 13, cursor: 'pointer',
              }}>
              {t('cancel') || 'Annulla'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
