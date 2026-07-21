import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * JoinFamilyByCodeModal — flusso 2-step: peek_family_by_code → accept_family_by_code.
 *
 * v2: supporto claim placeholder. Se la famiglia contiene membri "senza
 * account" (placeholder), dopo il peek viene chiesto "Chi sei?" e la
 * scelta viene passata a accept_family_by_code(p_claim_member_id) così
 * l'utente si aggancia al profilo esistente invece di creare un doppione.
 * Richiede la migrazione fammy-join-by-code-claim.sql.
 */
export default function JoinFamilyByCodeModal({ profile, onClose, onJoined }) {
  const { t } = useT();
  const [code, setCode] = useState('');
  const [name, setName] = useState(profile?.display_name || '');
  const [step, setStep] = useState('input'); // 'input' | 'preview' | 'success'
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // undefined = non ancora scelto, null = "crea nuovo", uuid = claim placeholder
  const [claimId, setClaimId] = useState(undefined);

  const placeholders = Array.isArray(preview?.placeholders) ? preview.placeholders : [];
  const hasPlaceholders = placeholders.length > 0 && !preview?.already_member;
  const mustPick = hasPlaceholders && claimId === undefined;
  const claimedPh = claimId ? placeholders.find((p) => p.id === claimId) : null;

  const handleCodeChange = (v) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(cleaned);
    if (err) setErr('');
  };

  // STEP 1 → peek
  const peek = async (e) => {
    e?.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { setErr(t('join_err_6char')); return; }
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('peek_family_by_code', { p_code: trimmed });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === 'invalid_code') setErr(t('join_err_invalid'));
        else if (data?.error === 'not_authenticated') setErr(t('join_err_session'));
        else setErr(`${t('join_err_generic')}: ${data?.error || ''}`);
        return;
      }
      setPreview(data);
      setClaimId(undefined);
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
        p_name: claimId ? null : (name.trim() || null),
        p_claim_member_id: claimId || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === 'placeholder_taken') {
          // Qualcun altro ha preso quel profilo nel frattempo: ricarica il peek
          setErr(t('join_err_ph_taken'));
          setClaimId(undefined);
          const { data: fresh } = await supabase.rpc('peek_family_by_code', {
            p_code: code.trim().toUpperCase(),
          });
          if (fresh?.ok) setPreview(fresh);
        } else {
          setErr(`${t('join_err_generic')}: ${data?.error || ''}`);
        }
        return;
      }
      setStep('success');
      setTimeout(() => onJoined?.(data.family_id), 1500);
    } catch (e2) {
      setErr(e2.message || t('join_err_generic'));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => { setStep('input'); setPreview(null); setClaimId(undefined); };

  return (
    <div className="modal-bg" onClick={onClose} data-testid="join-by-code-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        {/* === STEP: SUCCESS === */}
        {step === 'success' && preview && (
          <div style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ fontSize: 56, marginBottom: 10 }}>🎉</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontFamily: 'var(--fs)', fontWeight: 500 }}>
              {preview.already_member ? t('join_welcome_back') : t('join_welcome')}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--km)', lineHeight: 1.45 }}>
              {preview.already_member
                ? t('join_success_back', { name: preview.family_name })
                : t('join_success_new', { name: preview.family_name })}
            </p>
          </div>
        )}

        {/* === STEP: PREVIEW === */}
        {step === 'preview' && preview && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--km)', marginBottom: 4, letterSpacing: 0.5 }}>
                {t('join_about_to_join')}
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
                  👥 {preview.members_count === 1 ? t('join_members_count_1') : t('join_members_count_n', { n: preview.members_count })}
                </div>
              </div>

              {preview.already_member && (
                <div style={{
                  padding: '10px 14px', marginTop: 8, borderRadius: 10,
                  background: 'var(--amB)', border: '1px solid var(--am)',
                  fontSize: 12, color: 'var(--k)', lineHeight: 1.4,
                }}>
                  {t('join_already_member')}
                </div>
              )}
            </div>

            {/* === Picker "Chi sei?" (solo se ci sono placeholder) === */}
            {hasPlaceholders && (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: 'var(--km)',
                  marginBottom: 8, letterSpacing: 0.4, textAlign: 'center',
                }}>
                  {t('join_who_are_you')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {placeholders.map((ph) => {
                    const selected = claimId === ph.id;
                    return (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() => setClaimId(selected ? undefined : ph.id)}
                        data-testid={`join-claim-${ph.id}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 12,
                          border: selected ? '2px solid var(--ac)' : '1.5px solid var(--sm)',
                          background: selected ? 'var(--ab)' : 'white',
                          cursor: 'pointer', textAlign: 'left', width: '100%',
                        }}
                      >
                        <span style={{
                          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: ph.avatar_color || 'var(--k)',
                          color: 'white', fontWeight: 700, fontSize: 14,
                        }}>
                          {ph.avatar_letter || (ph.name || '?').charAt(0).toUpperCase()}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--k)' }}>
                            {t('join_i_am', { name: ph.name })}
                          </span>
                          {ph.role && (
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--km)' }}>
                              {ph.role}
                            </span>
                          )}
                        </span>
                        {selected && <span style={{ fontSize: 16 }}>✓</span>}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setClaimId(claimId === null ? undefined : null)}
                    data-testid="join-claim-new"
                    style={{
                      padding: '10px 12px', borderRadius: 12,
                      border: claimId === null ? '2px solid var(--ac)' : '1.5px dashed var(--sm)',
                      background: claimId === null ? 'var(--ab)' : 'transparent',
                      cursor: 'pointer', fontSize: 13, color: 'var(--km)', width: '100%',
                    }}
                  >
                    {t('join_claim_new')} {claimId === null && '✓'}
                  </button>
                </div>
              </div>
            )}

            {/* Input nome: solo se NON sta claimando un placeholder */}
            {!preview.already_member && !claimedPh && (!hasPlaceholders || claimId === null) && (
              <>
                <label htmlFor="join-name" style={{
                  display: 'block', fontSize: 11, fontWeight: 700,
                  color: 'var(--km)', marginBottom: 4, letterSpacing: 0.4,
                }}>{t('join_name_label')}</label>
                <input
                  id="join-name"
                  className="input"
                  placeholder={t("join_name_ph")}
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
                {t('join_back')}
              </button>
              <button type="button" className="btn" disabled={busy || (!preview.already_member && mustPick)}
                onClick={preview.already_member ? () => onJoined?.(preview.family_id) : confirmJoin}
                data-testid="join-confirm-btn"
                style={{
                  background: 'linear-gradient(135deg, var(--ac) 0%, #B5563D 100%)',
                  color: 'white', border: 'none',
                  boxShadow: '0 6px 18px rgba(193,98,75,0.32)',
                  opacity: (!preview.already_member && mustPick) ? 0.5 : 1,
                }}>
                {busy ? <span className="spin" /> : (preview.already_member ? t('join_go_to_family') : t('join_submit'))}
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
                {t('join_h')}
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--km)', lineHeight: 1.45 }}>
                <span dangerouslySetInnerHTML={{ __html: t('join_sub').replace(' ', '<br />').replace('rejoindre', 'rejoindre<br />') }} />
              </p>
            </div>

            <form onSubmit={peek}>
              <label htmlFor="invite-code-input" style={{
                display: 'block', fontSize: 10, fontWeight: 700,
                color: 'var(--km)', textTransform: 'uppercase', letterSpacing: 0.6,
                marginBottom: 6, textAlign: 'center',
              }}>{t('join_code_label')}</label>
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
                  {t('cancel')}
                </button>
                <button type="submit" className="btn" disabled={busy || code.length !== 6} data-testid="join-peek-btn">
                  {busy ? <span className="spin" /> : t('join_continue')}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
