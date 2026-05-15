import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function InviteShareModal({ familyId, familyName, member, session, onClose }) {
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  // Genera invito al mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Verifica se esiste già un invito pending per questo membro
      const existingQuery = supabase.from('invitations').select('*')
        .eq('family_id', familyId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      const { data: existing } = member?.id
        ? await existingQuery.eq('member_id', member.id).maybeSingle()
        : { data: null };

      if (existing && !cancelled) {
        setToken(existing.token);
        setBusy(false);
        return;
      }

      // Crea nuovo invito
      const { data, error } = await supabase.from('invitations').insert({
        family_id: familyId,
        member_id: member?.id || null,
        invited_by: session.user.id,
      }).select().single();

      if (cancelled) return;
      if (error) { setErr(error.message); }
      else setToken(data.token);
      setBusy(false);
    })();
    return () => { cancelled = true; };
  }, [familyId, member]);

  const inviteUrl = token ? `${window.location.origin}/invite/${token}` : '';

  const shareMessage = member?.name
    ? `Ciao ${member.name}! Ti ho aggiunto alla famiglia "${familyName}" su FAMMY. Apri questo link per entrare:\n${inviteUrl}`
    : `Ti invito alla famiglia "${familyName}" su FAMMY. Apri questo link per entrare:\n${inviteUrl}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invito a ${familyName}`,
          text: shareMessage,
        });
      } catch {}
    } else {
      copy();
    }
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Invita {member?.name ? member.name : 'qualcuno'} 💌</h2>
        <p className="modal-sub">
          Manda questo link a chi vuoi invitare. Quando lo aprirà e inserirà la sua email,
          entrerà automaticamente in <strong>{familyName}</strong>.
        </p>

        {busy && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <span className="spin dark" />
          </div>
        )}

        {err && <div className="login-msg error">{err}</div>}

        {token && (
          <>
            <div style={{
              padding: 14, background: 'white', border: '1px solid var(--sm)', borderRadius: 12,
              fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--km)',
              marginBottom: 12,
            }}>
              {inviteUrl}
            </div>

            <button className="btn full" onClick={share} style={{ marginBottom: 8 }}>
              📤 Condividi link
            </button>

            <div className="row">
              <button className="btn secondary" onClick={shareWhatsApp} style={{ background: '#25D366', color: 'white', border: 'none' }}>
                💬 WhatsApp
              </button>
              <button className="btn secondary" onClick={copy}>
                {copied ? '✓ Copiato!' : '📋 Copia'}
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--km)', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
              Il link scade dopo 14 giorni. Se non viene usato, puoi sempre generarne uno nuovo.
            </p>
          </>
        )}

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn secondary full" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}
