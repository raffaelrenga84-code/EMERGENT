import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * JoinFamilyByCodeModal — flusso 2-step:
 *   1) inserisci codice → peek_family_by_code (preview senza joinare)
 *   2) conferma → accept_family_by_code (join effettivo)
 *
 * Anti-doppione: peek mostra `already_member: true` se l'utente è già dentro.
 */
export default function JoinFamilyByCodeModal({ profile, onClose, onJoined }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(profile?.display_name || '');
  const [step, setStep] = useState('input'); // 'input' | 'preview' | 'success'
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleCodeChange = (v) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(cleaned);
    if (err) setErr('');
  };

  // STEP 1 → peek
  const peek = async (e) => {
    e?.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { setErr('Il codice deve essere di 6 caratteri'); return; }
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('peek_family_by_code', { p_code: trimmed });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === 'invalid_code') setErr('Codice non valido. Controlla con chi te lo ha mandato.');
        else if (data?.error === 'not_authenticated') setErr('Sessione scaduta. Riaccedi.');
        else setErr(`Errore: ${data?.error || 'sconosciuto'}`);
        return;
      }
      setPreview(data);
      setStep('preview');
    } catch (e2) {
      setErr(e2.message || 'Errore');
    } finally {
      setBusy(false);
    }
  };

  // STEP 2 → accept
  const confirmJoin = async () => {
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('accept_family_by_code', {
        p_code: code.trim().toUpperCase(),
        p_name: name.trim() || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        setErr(`Errore: ${data?.error || 'sconosciuto'}`);
        return;
      }
      setStep('success');
      setTimeout(() => onJoined?.(data.family_id), 1500);
    } catch (e2) {
      setErr(e2.message || 'Errore');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => { setStep('input'); setPreview(null); };

  return (
    <div className="modal-bg" onClick={onClose} data-testid="join-by-code-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        {/* === STEP: SUCCESS === */}
        {step === 'success' && preview && (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🎉</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontFamily: 'var(--fs)', fontWeight: 500 }}>
              {preview.already_member ? 'Bentornato!' : 'Benvenuto!'}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--km)', lineHeight: 1.45 }}>
              {preview.already_member
                ? `Sei già membro di "${preview.family_name}".`
                : `Sei stato aggiunto a "${preview.family_name}".`}
            </p>
          </div>
        )}

        {/* === STEP: PREVIEW === */}
        {step === 'preview' && preview && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--km)', marginBottom: 4, letterSpacing: 0.5 }}>
                STAI PER UNIRTI A
              </div>
              {/* Preview card della famiglia */}
              <div style={{
                margin: '12px 0', padding: '24px 16px',
                background: 'linear-gradient(135deg, var(--ab) 0%, white 100%)',
                border: '1.5px solid var(--sm)', borderRadius: 20,
              }}>
                <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 8 }}>
                  {preview.emoji || '🏡'}
                </div>
                <h2 style={{
                  margin: '0 0 6px', fontSize: 24, fontFamily: 'var(--fs)',
                  fontWeight: 500, letterSpacing: '-0.02em',
                }}>
                  {preview.family_name}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--km)' }}>
                  👥 {preview.members_count} {preview.members_count === 1 ? 'membro' : 'membri'}
                </div>
              </div>

              {preview.already_member && (
                <div style={{
                  padding: '10px 14px', marginTop: 8, borderRadius: 10,
                  background: 'var(--amB)', border: '1px solid var(--am)',
                  fontSize: 12, color: 'var(--k)', lineHeight: 1.4,
                }}>
                  ✓ Sei già membro di questa famiglia. Vai pure a vedere!
                </div>
              )}
            </div>

            {!preview.already_member && (
              <>
                <label htmlFor="join-name" style={{
                  display: 'block', fontSize: 11, fontWeight: 700,
                  color: 'var(--km)', marginBottom: 4, letterSpacing: 0.4,
                }}>COME TI CHIAMI?</label>
                <input
                  id="join-name"
                  className="input"
                  placeholder="Il tuo nome (es. Marco)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="join-name-input"
                  style={{ marginBottom: 16 }}
                />
              </>
            )}

            {err && (
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: '#FDECEC', color: 'var(--rd)',
                fontSize: 12, marginBottom: 12, lineHeight: 1.4,
              }}>⚠️ {err}</div>
            )}

            <div className="row">
              <button type="button" className="btn secondary" onClick={goBack} data-testid="join-back-btn">
                ‹ Indietro
              </button>
              <button type="button" className="btn" disabled={busy}
                onClick={preview.already_member ? () => onJoined?.(preview.family_id) : confirmJoin}
                data-testid="join-confirm-btn"
                style={{
                  background: 'linear-gradient(135deg, var(--ac) 0%, #B5563D 100%)',
                  color: 'white', border: 'none',
                  boxShadow: '0 6px 18px rgba(193,98,75,0.32)',
                }}>
                {busy ? <span className="spin" /> : (preview.already_member ? '🏡 Vai alla famiglia' : '🚀 Unisciti')}
              </button>
            </div>
          </>
        )}

        {/* === STEP: INPUT === */}
        {step === 'input' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 42, marginBottom: 6 }}>🎟️</div>
              <h2 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--fs)', fontWeight: 500, letterSpacing: '-0.015em' }}>
                Hai un codice invito?
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--km)', lineHeight: 1.45 }}>
                Inserisci il codice che ti hanno mandato per unirti<br />a una famiglia già esistente.
              </p>
            </div>

            <form onSubmit={peek}>
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

              {err && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: '#FDECEC', color: 'var(--rd)',
                  fontSize: 12, marginBottom: 12, lineHeight: 1.4,
                }}>⚠️ {err}</div>
              )}

              <div className="row">
                <button type="button" className="btn secondary" onClick={onClose} data-testid="join-cancel-btn">
                  Annulla
                </button>
                <button type="submit" className="btn" disabled={busy || code.length !== 6} data-testid="join-peek-btn">
                  {busy ? <span className="spin" /> : 'Continua →'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
