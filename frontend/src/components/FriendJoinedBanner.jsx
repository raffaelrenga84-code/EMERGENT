import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * FriendJoinedBanner — chiude il ciclo referral.
 * Compare quando un amico invitato da te si iscrive (friend_invites
 * accepted e non ancora handled). Bivio:
 *   · Aggiungi a una famiglia → manda una PROPOSTA con consenso
 *     (family_join_offers): l'amico accetta/rifiuta dal suo banner.
 *   · Più tardi → segna handled, sparisce.
 */
export default function FriendJoinedBanner({ session, families = [] }) {
  const { t: __t0 } = useT();
  const t = (k, v) => { const r = __t0(k, v); return r === k ? '' : r; };
  const myUserId = session?.user?.id;
  const [items, setItems] = useState([]);
  const [pickFor, setPickFor] = useState(null); // invite in fase di scelta famiglia
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!myUserId) return;
    try {
      const { data } = await supabase.from('friend_invites')
        .select('id, accepted_by, accepted_name, label, accepted_at')
        .eq('status', 'accepted')
        .is('handled_at', null)
        .order('accepted_at', { ascending: false });
      setItems(data || []);
    } catch (_) { /* migration non ancora eseguita */ }
  };
  useEffect(() => { load(); }, [myUserId]);

  const dismiss = async (inv) => {
    setItems((p) => p.filter((x) => x.id !== inv.id));
    try {
      await supabase.from('friend_invites')
        .update({ handled_at: new Date().toISOString() }).eq('id', inv.id);
    } catch (_) {}
  };

  // Manda la proposta con consenso verso la famiglia scelta
  const proposeToFamily = async (inv, family) => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const myRow = (await supabase.from('members')
        .select('id, name').eq('family_id', family.id).eq('user_id', user?.id).maybeSingle()).data;
      const friendName = inv.accepted_name || inv.label || 'Amico';
      await supabase.from('family_join_offers').insert({
        family_id: family.id,
        target_user_id: inv.accepted_by,
        name: friendName,
        role: 'altro',
        avatar_letter: friendName.charAt(0).toUpperCase(),
        avatar_color: '#8C9D86',
        family_name: family.name,
        family_emoji: family.emoji,
        inviter_name: myRow?.name || null,
        invited_by: myRow?.id || null,
      });
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: `${t('fj_offer_sent') || 'Proposta inviata a'} ${friendName} 💌`, tone: 'success' },
      }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: (e && e.message) || 'Errore', tone: 'error' },
      }));
    }
    setBusy(false);
    setPickFor(null);
    dismiss(inv);
  };

  if (items.length === 0) return null;
  const myFamilies = families.filter((f) => f.created_by === myUserId || f.id);

  return (
    <>
      {items.map((inv) => {
        const name = inv.accepted_name || inv.label || (t('fj_generic') || 'Il tuo amico');
        const picking = pickFor === inv.id;
        return (
          <div key={inv.id} data-testid={`friend-joined-${inv.id}`} style={{
            margin: '0 16px 12px', padding: '14px 16px', borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(193,98,75,0.12), rgba(193,98,75,0.04))',
            border: '1.5px solid rgba(193,98,75,0.4)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--k)' }}>
              🎉 {name} {t('fj_joined') || 'si è iscritto a FAMMY!'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--km)', marginTop: 3, lineHeight: 1.4 }}>
              {t('fj_sub') || 'Vuoi aggiungerlo a una delle tue famiglie? Riceverà una proposta e decide lui.'}
            </div>

            {!picking ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setPickFor(inv.id)}
                  data-testid={`friend-joined-add-${inv.id}`}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 12, border: 'none',
                    background: 'var(--ac)', color: '#fff', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer',
                  }}>
                  👨‍👩‍👧 {t('fj_add_btn') || 'Aggiungi a una famiglia'}
                </button>
                <button type="button" onClick={() => dismiss(inv)}
                  style={{
                    padding: '10px 14px', borderRadius: 12,
                    border: '1.5px solid var(--sm)', background: 'var(--s)',
                    color: 'var(--km)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}>
                  {t('fj_later') || 'Più tardi'}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--k)', marginBottom: 6 }}>
                  {t('fj_pick') || 'In quale famiglia?'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {myFamilies.map((f) => (
                    <button key={f.id} type="button" disabled={busy}
                      onClick={() => proposeToFamily(inv, f)}
                      data-testid={`friend-joined-fam-${f.id}`}
                      style={{
                        padding: '7px 12px', borderRadius: 100, fontSize: 12.5,
                        border: '1.5px solid var(--sm)', background: 'var(--s)',
                        color: 'var(--k)', fontWeight: 600, cursor: 'pointer',
                      }}>
                      {f.emoji || '🏠'} {f.name}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => setPickFor(null)}
                  style={{
                    marginTop: 8, background: 'none', border: 'none',
                    color: 'var(--km)', fontSize: 12, cursor: 'pointer', padding: 4,
                  }}>
                  ← {t('back') || 'Indietro'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
