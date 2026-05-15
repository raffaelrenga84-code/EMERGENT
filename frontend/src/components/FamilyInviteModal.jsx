import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * Modal unificato per gestire gli inviti di una famiglia
 * - Mostra link "generico" condivisibile
 * - Mostra i membri placeholder (senza account) per cui si può
 *   generare un link DEDICATO (member_id pre-collegato), così
 *   chi accetta non crea un duplicato
 * - Lista inviti pending
 */
export default function FamilyInviteModal({ family, session, onClose }) {
  const { t } = useT();
  const [inviteToken, setInviteToken] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [placeholders, setPlaceholders] = useState([]);
  // Mappa member_id -> { token, copied }
  const [dedicatedLinks, setDedicatedLinks] = useState({});
  const [genBusyId, setGenBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const buildUrl = (tok) => (tok ? `${origin}/invite/${tok}` : '');

  // Carica inviti, token e placeholder
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { data: invites } = await supabase
          .from('invitations')
          .select(`
            id, token, status, created_at, expires_at, member_id,
            members (id, name, role)
          `)
          .eq('family_id', family.id)
          .eq('status', 'pending')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        const list = invites || [];
        setInvitations(list);

        // Link generico = invito pending SENZA member_id
        const generic = list.find((i) => !i.member_id);
        if (generic) {
          setInviteToken(generic.token);
        } else {
          const { data: newInvite } = await supabase
            .from('invitations')
            .insert({
              family_id: family.id,
              member_id: null,
              invited_by: session.user.id,
            })
            .select()
            .single();
          if (newInvite) {
            setInviteToken(newInvite.token);
            setInvitations([newInvite, ...list]);
          }
        }

        // Link dedicati già esistenti per ogni placeholder
        const dedicatedMap = {};
        for (const inv of list) {
          if (inv.member_id) dedicatedMap[inv.member_id] = { token: inv.token, copied: false };
        }
        setDedicatedLinks(dedicatedMap);

        // Membri placeholder della famiglia (senza account)
        const { data: members } = await supabase
          .from('members')
          .select('id, name, role, avatar_letter, avatar_color')
          .eq('family_id', family.id)
          .is('user_id', null)
          .neq('status', 'inactive')
          .order('created_at', { ascending: true });
        setPlaceholders(members || []);
      } catch (err) {
        console.error('Errore caricamento inviti:', err);
      }
      setLoading(false);
    };

    loadData();
  }, [family.id, session.user.id]);

  const inviteUrl = buildUrl(inviteToken);
  const shareMessage = `Ti invito a unirti alla famiglia "${family.name}" su FAMMY! 🏡\n\nApri questo link:\n${inviteUrl}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const shareViaWeb = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invito a ${family.name}`,
          text: shareMessage,
          url: inviteUrl,
        });
      } catch {}
    } else {
      copyToClipboard();
    }
  };

  const shareViaWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank');
  };

  const regenerateToken = async () => {
    setBusy(true);
    try {
      // Annulla SOLO gli inviti generici (non i link dedicati)
      await supabase
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('family_id', family.id)
        .eq('status', 'pending')
        .is('member_id', null);

      const { data: newInvite } = await supabase
        .from('invitations')
        .insert({
          family_id: family.id,
          member_id: null,
          invited_by: session.user.id,
        })
        .select()
        .single();

      if (newInvite) {
        setInviteToken(newInvite.token);
        setInvitations((prev) => [newInvite, ...prev.filter((i) => i.member_id)]);
      }
    } catch (err) {
      console.error('Errore rigenerazione token:', err);
    }
    setBusy(false);
  };

  const generateDedicatedLink = async (placeholder) => {
    setGenBusyId(placeholder.id);
    try {
      // Annulla precedenti inviti dedicati pending per lo stesso placeholder
      await supabase
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('family_id', family.id)
        .eq('member_id', placeholder.id)
        .eq('status', 'pending');

      const { data: newInvite, error } = await supabase
        .from('invitations')
        .insert({
          family_id: family.id,
          member_id: placeholder.id,
          invited_by: session.user.id,
        })
        .select()
        .single();

      if (!error && newInvite) {
        setDedicatedLinks((prev) => ({
          ...prev,
          [placeholder.id]: { token: newInvite.token, copied: false },
        }));
        setInvitations((prev) => [newInvite, ...prev]);
      }
    } catch (err) {
      console.error('Errore generazione link dedicato:', err);
    }
    setGenBusyId(null);
  };

  const copyDedicated = async (memberId) => {
    const entry = dedicatedLinks[memberId];
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(buildUrl(entry.token));
      setDedicatedLinks((prev) => ({
        ...prev,
        [memberId]: { ...prev[memberId], copied: true },
      }));
      setTimeout(() => {
        setDedicatedLinks((prev) => ({
          ...prev,
          [memberId]: prev[memberId] ? { ...prev[memberId], copied: false } : prev[memberId],
        }));
      }, 2000);
    } catch {}
  };

  const shareDedicatedWhatsApp = (placeholder) => {
    const entry = dedicatedLinks[placeholder.id];
    if (!entry) return;
    const url = buildUrl(entry.token);
    const msg =
      `Ciao ${placeholder.name}! Ti ho aggiunto alla famiglia "${family.name}" su FAMMY 🏡\n` +
      `Apri questo link e accederai direttamente al TUO profilo già pronto:\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎁 {t('invite_people_to', { name: family.name })}</h2>
        <p className="modal-sub">{t('invite_share_hint')}</p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <span className="spin" />
          </div>
        ) : (
          <>
            {/* ============ LINK GENERICO ============ */}
            {inviteUrl && (
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--s)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--k)', marginBottom: 8 }}>
                  {t('invite_link_label')}
                </div>
                <div
                  style={{
                    padding: 10, background: 'white', border: '1px solid var(--sm)',
                    borderRadius: 8, fontSize: 11, fontFamily: 'monospace',
                    wordBreak: 'break-all', color: 'var(--km)', marginBottom: 8, lineHeight: 1.4,
                  }}
                >
                  {inviteUrl}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button className="btn full secondary" onClick={copyToClipboard} style={{ flex: 1 }}>
                    {copied ? '✓' : '📋'} {t('copy_btn')}
                  </button>
                  <button className="btn full secondary" onClick={shareViaWeb} style={{ flex: 1 }}>
                    📤 Condividi
                  </button>
                </div>
                <button
                  className="btn full secondary"
                  onClick={shareViaWhatsApp}
                  style={{ background: '#25D366', color: 'white', border: 'none' }}
                >
                  💬 WhatsApp
                </button>
              </div>
            )}

            {/* ============ LINK DEDICATI PER PLACEHOLDER ============ */}
            {placeholders.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--ybB)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--k)', marginBottom: 4 }}>
                  📨 Invita un membro già aggiunto
                </div>
                <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 10, lineHeight: 1.4 }}>
                  Genera un link <strong>dedicato</strong> per chi è già in famiglia senza account: quando accetta, si collega al SUO profilo invece di crearne uno nuovo (niente doppioni).
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {placeholders.map((p) => {
                    const entry = dedicatedLinks[p.id];
                    const url = entry ? buildUrl(entry.token) : '';
                    return (
                      <div
                        key={p.id}
                        style={{
                          padding: 10, background: 'white', border: '1px solid var(--sm)',
                          borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: p.avatar_color || '#1C1611', color: 'white',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 700, flexShrink: 0,
                            }}
                          >
                            {p.avatar_letter || p.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--km)' }}>
                              {p.role || 'altro'} · no account
                            </div>
                          </div>
                          {!entry && (
                            <button
                              className="btn secondary"
                              onClick={() => generateDedicatedLink(p)}
                              disabled={genBusyId === p.id}
                              style={{ fontSize: 11, padding: '6px 10px', whiteSpace: 'nowrap' }}
                            >
                              {genBusyId === p.id ? <span className="spin" /> : 'Genera link'}
                            </button>
                          )}
                        </div>
                        {entry && (
                          <>
                            <div
                              style={{
                                padding: 8, background: 'var(--s)', border: '1px solid var(--sm)',
                                borderRadius: 6, fontSize: 10, fontFamily: 'monospace',
                                wordBreak: 'break-all', color: 'var(--km)', lineHeight: 1.4,
                              }}
                            >
                              {url}
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn secondary"
                                onClick={() => copyDedicated(p.id)}
                                style={{ flex: 1, fontSize: 11, padding: '6px 8px' }}
                              >
                                {entry.copied ? '✓ Copiato' : '📋 Copia'}
                              </button>
                              <button
                                onClick={() => shareDedicatedWhatsApp(p)}
                                style={{
                                  flex: 1, fontSize: 11, padding: '6px 8px',
                                  background: '#25D366', color: 'white',
                                  border: 'none', borderRadius: 8, cursor: 'pointer',
                                  fontWeight: 600,
                                }}
                              >
                                💬 WhatsApp
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============ INVITI PENDING ============ */}
            {invitations.length > 0 && (
              <div style={{ marginBottom: 16, padding: 12, background: 'var(--s)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--k)', marginBottom: 8 }}>
                  {t('invites_pending', { n: invitations.length })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {invitations.map((inv) => {
                    const daysLeft = Math.ceil(
                      (new Date(inv.expires_at) - new Date()) / (1000 * 60 * 60 * 24)
                    );
                    const memberName = inv.members?.name || t('invite_generic');
                    return (
                      <div
                        key={inv.id}
                        style={{
                          padding: 8, background: 'white', border: '1px solid var(--sm)',
                          borderRadius: 6, fontSize: 12, display: 'flex',
                          justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>{memberName}</div>
                          <div style={{ fontSize: 10, color: 'var(--km)' }}>
                            {t('expires_in', {
                              n: daysLeft,
                              unit: daysLeft === 1 ? t('day_one') : t('day_many'),
                            })}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ab)', fontWeight: 600 }}>
                          ⏳ Pending
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              style={{
                marginBottom: 16, padding: 10, background: 'var(--ybB)',
                borderRadius: 8, fontSize: 11, color: 'var(--yb)',
              }}
            >
              {t('expires_after_hint')}
            </div>

            <button
              className="btn secondary full"
              onClick={regenerateToken}
              disabled={busy}
              style={{ marginBottom: 12 }}
            >
              {busy ? <span className="spin" /> : t('regenerate_new_link')}
            </button>
          </>
        )}

        <div className="row">
          <button className="btn secondary full" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
