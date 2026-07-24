import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * FamilyOfferBanner — banner in Bacheca per gli inviti in-app con consenso.
 * Mostra le proposte pendenti per l'utente corrente ("💌 Raffael ti ha
 * invitato nella famiglia Topolini") con Accetta / Rifiuta.
 * Le proposte nascono da AddMemberModal → "Già su FAMMY in un'altra famiglia?".
 */
export default function FamilyOfferBanner({ session, onChanged }) {
  const { t: __t0 } = useT();
  const t = (k, vars) => { const v = __t0(k, vars); return v === k ? '' : v; };
  const [offers, setOffers] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    if (!session?.user?.id) return;
    try {
      const { data } = await supabase
        .from('family_join_offers')
        .select('id, family_name, family_emoji, inviter_name, created_at')
        .eq('target_user_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      setOffers(data || []);
    } catch (_) { /* migration non ancora eseguita */ }
  };

  useEffect(() => { load(); }, [session?.user?.id]);

  const respond = async (offer, accept) => {
    setBusyId(offer.id);
    const { error } = await supabase.rpc(
      accept ? 'accept_family_offer' : 'decline_family_offer',
      { p_offer_id: offer.id }
    );
    setBusyId(null);
    if (error) {
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: error.message, tone: 'error' },
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent('fammy_toast', {
      detail: {
        text: accept
          ? `${t('offer_accepted_toast') || 'Benvenuto nella famiglia'} ${offer.family_emoji || ''} ${offer.family_name || ''}!`.trim()
          : (t('offer_declined_toast') || 'Invito rifiutato'),
        tone: accept ? 'success' : 'info',
      },
    }));
    setOffers((p) => p.filter((o) => o.id !== offer.id));
    if (accept && onChanged) onChanged();
  };

  if (offers.length === 0) return null;

  return (
    <>
      {offers.map((o) => (
        <div key={o.id} data-testid={`family-offer-${o.id}`} style={{
          margin: '0 16px 12px', padding: '14px 16px', borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(193,98,75,0.10), rgba(193,98,75,0.04))',
          border: '1.5px solid rgba(193,98,75,0.35)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)' }}>
            💌 {o.inviter_name || 'Qualcuno'} {t('offer_banner_mid') || 'ti ha invitato in'} {o.family_emoji || ''} {o.family_name || ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 3, lineHeight: 1.4 }}>
            {t('offer_banner_p') || 'Decidi tu: se accetti entri nella famiglia, altrimenti nessun problema.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" disabled={busyId === o.id}
              onClick={() => respond(o, true)}
              data-testid={`family-offer-accept-${o.id}`}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 12, border: 'none',
                background: 'var(--ac)', color: '#fff', fontWeight: 700,
                fontSize: 13, cursor: 'pointer',
              }}>
              {busyId === o.id ? '…' : `✓ ${t('offer_accept') || 'Accetta'}`}
            </button>
            <button type="button" disabled={busyId === o.id}
              onClick={() => respond(o, false)}
              data-testid={`family-offer-decline-${o.id}`}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 12,
                border: '1.5px solid var(--sm)', background: 'var(--s)',
                color: 'var(--km)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>
              {t('offer_decline') || 'No, grazie'}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
