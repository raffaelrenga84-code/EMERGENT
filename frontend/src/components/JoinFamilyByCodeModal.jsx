import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * JoinFamilyByCodeModal — input 6 char per unirsi a una famiglia esistente
 * tramite codice invito. Chiama l'RPC `accept_family_by_code(p_code, p_name)`.
 *
 * Anti-doppione: se l'utente è già membro, l'RPC restituisce `already_member: true`
 * e non crea un duplicato.
 */
export default function JoinFamilyByCodeModal({ profile, onClose, onJoined }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(profile?.display_name || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState(null); // { family_name, already_member }

  const submit = async (e) => {
    e?.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setErr('Il codice deve essere di 6 caratteri');
      return;
    }
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('accept_family_by_code', {
        p_code: trimmed,
        p_name: name.trim() || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === 'invalid_code') setErr('Codice non valido. Controlla con chi te lo ha mandato.');
        else if (data?.error === 'not_authenticated') setErr('Sessione scaduta. Riaccedi.');
        else setErr(`Errore: ${data?.error || 'sconosciuto'}`);
        return;
      }
      setSuccess({ family_name: data.family_name, already_member: data.already_member });
      // Dai un attimo al render del success, poi chiudi
      setTimeout(() => onJoined?.(data.family_id), 1500);
    } catch (e2) {
      setErr(e2.message || 'Errore');
    } finally {
      setBusy(false);
    }
  };

  // formattazione live: maiuscolo, niente spazi, max 6 char
  const handleCodeChange = (v) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(cleaned);
  };

  return (
    <div className="modal-bg" onClick={onClose} data-testid="join-by-code-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🎉</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontFamily: 'var(--fs)', fontWeight: 500 }}>
              {success.already_member ? 'Bentornato!' : 'Benvenuto!'}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--km)', lineHeight: 1.45 }}>
              {success.already_member
                ? `Sei già membro di "${success.family_name}".`
                : `Sei stato aggiunto a "${success.family_name}".`}
            </p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 6 }}>🎟️</div>
              <h2 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--fs)', fontWeight: 500, letterSpacing: '-0.015em' }}>
                Hai un codice invito?
              </h2>
              <p style={{
                margin: '6px 0 0', fontSize: 13, color: 'var(--km)', lineHeight: 1.45,
              }}>
                Inserisci il codice che ti hanno mandato per unirti<br />a una famiglia già esistente.
              </p>
            </div>

            <form onSubmit={submit}>
              {/* Code input: 6 box-style */}
              <label htmlFor="invite-code-input" style={{
                display: 'block', fontSize: 10, fontWeight: 700,
                color: 'var(--km)', textTransform: 'uppercase', letterSpacing: 0.6,
                marginBottom: 6, textAlign: 'center',
              }}>Codice (6 caratteri)</label>
              <input
                id="invite-code-input"
                type="text"
                autoFocus
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="ES. MX68YV"
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                data-testid="join-code-input"
                style={{
                  width: '100%', padding: '14px 16px',
                  fontFamily: 'var(--fs)', fontSize: 32, fontWeight: 600,
                  textAlign: 'center', letterSpacing: '0.2em',
                  border: '2px solid var(--sm)', borderRadius: 14,
                  color: 'var(--ac)', textTransform: 'uppercase',
                  marginBottom: 16, background: 'var(--ab)',
                }}
              />

              <label htmlFor="join-name" style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                color: 'var(--km)', marginBottom: 4,
              }}>Come ti chiami?</label>
              <input
                id="join-name"
                className="input"
                placeholder="Il tuo nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="join-name-input"
                style={{ marginBottom: 16 }}
              />

              {err && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: '#FDECEC', color: 'var(--rd)',
                  fontSize: 12, marginBottom: 12, lineHeight: 1.4,
                }}>
                  ⚠️ {err}
                </div>
              )}

              <div className="row">
                <button type="button" className="btn secondary" onClick={onClose} data-testid="join-cancel-btn">
                  Annulla
                </button>
                <button type="submit" className="btn" disabled={busy || code.length !== 6}
                  data-testid="join-submit-btn">
                  {busy ? <span className="spin" /> : '🚀 Unisciti'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
