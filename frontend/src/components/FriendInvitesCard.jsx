import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { APP_URL } from '../lib/appUrl.js';

/**
 * FriendInvitesCard — lista degli inviti amico (fuori famiglia) con stato
 * "In attesa" / "Iscritto". Sostituisce il vecchio contatore cieco.
 * Ogni invito ha un token: il link diventa myfammy.app/?ref=<token>,
 * e quando l'invitato completa il primo login la riga passa ad accepted.
 */
export default function FriendInvitesCard({ session }) {
  const { t: __t0, lang } = useT();
  const t = (k, v) => { const r = __t0(k, v); return r === k ? '' : r; };
  const myUserId = session?.user?.id;
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!myUserId) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('friend_invites')
        .select('id, token, label, status, created_at, accepted_at')
        .order('created_at', { ascending: false });
      setInvites(data || []);
    } catch (_) { /* migration non ancora eseguita */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, [myUserId]);

  // Crea un invito tracciato e apre lo share sheet col link ?ref=
  const createAndShare = async (label) => {
    setCreating(true);
    let token = null;
    try {
      const { data, error } = await supabase.from('friend_invites')
        .insert({ inviter_user_id: myUserId, label: label || null })
        .select('token').single();
      if (!error) token = data.token;
    } catch (_) {}
    setCreating(false);

    const url = token ? `${APP_URL}/?ref=${token}` : APP_URL;
    const msg = t('profile_referral_msg', { url });
    const bare = t('profile_referral_msg', { url: '' }).replace(/[\s:]*$/, '');
    try {
      if (navigator.share) await navigator.share({ title: 'FAMMY', text: bare, url });
      else { await navigator.clipboard.writeText(msg); window.dispatchEvent(new CustomEvent('fammy_toast', { detail: { text: t('share_copied') || 'Link copiato', tone: 'success' } })); }
    } catch (_) {}
    load();
  };

  const promptAndShare = async () => {
    let label = '';
    try { label = window.prompt(t('friend_inv_label_q') || 'A chi lo mandi? (nota per te, es. "Marco")') || ''; } catch (_) {}
    createAndShare(label.trim());
  };

  // Elimina un invito (annulla se in attesa, o rimuove la riga di tracking).
  const deleteInvite = async (inv) => {
    let ok = true;
    try { ok = window.confirm(t('friend_inv_delete_q') || 'Eliminare questo invito?'); } catch (_) {}
    if (!ok) return;
    const prev = invites;
    setInvites((p) => p.filter((x) => x.id !== inv.id)); // ottimistico
    try {
      const { error } = await supabase.from('friend_invites').delete().eq('id', inv.id);
      if (error) throw error;
    } catch (_) {
      setInvites(prev); // ripristina se fallisce (es. policy RLS di DELETE mancante)
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: { text: t('friend_inv_delete_err') || "Impossibile eliminare l'invito", tone: 'error' },
      }));
    }
  };

  const fmt = (iso) => new Date(iso).toLocaleDateString(lang || 'it', { day: 'numeric', month: 'short' });

  const accepted = invites.filter((i) => i.status === 'accepted').length;

  return (
    <div data-testid="friend-invites-card" style={{
      margin: '4px 0 14px', padding: '16px 18px',
      background: 'linear-gradient(135deg, var(--ab) 0%, white 100%)',
      border: '1px solid var(--sm)', borderRadius: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>💌</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--fs)', fontSize: 16, fontWeight: 600, color: 'var(--k)' }}>
            {t('friend_inv_h') || 'I tuoi inviti'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--km)' }}>
            {invites.length === 0
              ? (t('friend_inv_sub_empty') || 'Invita un amico e segui qui se si iscrive.')
              : (t('friend_inv_sub', { a: accepted, n: invites.length }) || `${accepted} iscritti su ${invites.length} inviti`)}
          </div>
        </div>
      </div>

      {loading ? null : invites.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {invites.slice(0, 8).map((inv) => {
            const ok = inv.status === 'accepted';
            return (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10,
                background: ok ? '#F1F7EE' : 'var(--s)',
                border: `1px solid ${ok ? '#CFE3C6' : 'var(--sm)'}`,
              }}>
                <span style={{ fontSize: 15 }}>{ok ? '✅' : '⏳'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--k)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inv.label || (t('friend_inv_generic') || 'Invito')}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--km)' }}>
                    {ok
                      ? `${t('friend_inv_joined') || 'Iscritto'} · ${fmt(inv.accepted_at)}`
                      : `${t('friend_inv_pending') || 'In attesa'} · ${fmt(inv.created_at)}`}
                  </div>
                </div>
                <button type="button"
                  onClick={() => deleteInvite(inv)}
                  data-testid={`friend-invite-delete-${inv.id}`}
                  aria-label={t('friend_inv_delete') || 'Elimina invito'}
                  title={t('friend_inv_delete') || 'Elimina invito'}
                  style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--km)', fontSize: 15, lineHeight: 1,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="btn full" disabled={creating}
        onClick={promptAndShare} data-testid="friend-invite-new">
        {creating ? '…' : (t('profile_referral_btn') || '💝 Invita un amico nuovo')}
      </button>
    </div>
  );
}
