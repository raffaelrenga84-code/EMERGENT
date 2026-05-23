import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import NativeDateInput from './NativeDateInput.jsx';

const REASON_META = {
  trip:     { icon: '✈️', it: 'Volo',       en: 'Trip',     fr: 'Vol',        de: 'Flug' },
  standby:  { icon: '📞', it: 'Reperibile', en: 'Standby',  fr: 'Astreinte',  de: 'Bereitschaft' },
  training: { icon: '🎓', it: 'Training',   en: 'Training', fr: 'Formation',  de: 'Schulung' },
  vacation: { icon: '🏖️', it: 'Vacanza',    en: 'Vacation', fr: 'Vacances',   de: 'Urlaub' },
  work:     { icon: '💼', it: 'Lavoro',     en: 'Work',     fr: 'Travail',    de: 'Arbeit' },
  health:   { icon: '🏥', it: 'Salute',     en: 'Health',   fr: 'Santé',      de: 'Gesundheit' },
  other:    { icon: '📌', it: 'Altro',      en: 'Other',    fr: 'Autre',      de: 'Anderes' },
};

/**
 * ImportScheduleModal — Carica uno screenshot del turno (es. apps crew aereo)
 * e usa la Edge Function `parse-schedule` (Gemini Vision) per estrarre tutte
 * le assenze del mese. Mostra una preview editabile prima dell'insert in DB.
 *
 * Workflow:
 *   1. upload  → user sceglie file da galleria o scatta foto
 *   2. parsing → Gemini analizza, ritorna array di assenze
 *   3. preview → user può modificare/eliminare ogni assenza
 *   4. confirm → bulk insert in tabella `absences`
 *
 * Props:
 *  - session, profile, families
 *  - onClose, onSaved (callback dopo bulk insert riuscito)
 */
export default function ImportScheduleModal({ session, profile, families = [], onClose, onSaved }) {
  const { t, lang } = useT();
  const fileRef = useRef(null);
  // Stati: 'upload' | 'parsing' | 'preview' | 'saving'
  const [stage, setStage] = useState('upload');
  const [previewSrc, setPreviewSrc] = useState(null);
  const [err, setErr] = useState('');
  const [detectedMonth, setDetectedMonth] = useState(null);
  const [parsed, setParsed] = useState([]); // [{start_date, end_date, reason, location, note, _id, _keep}]
  // Default: condividi con tutte le famiglie (utente può deselezionare)
  const [visibleFamilies, setVisibleFamilies] = useState(families.map((f) => f.id));

  const reasonLabel = (id) => {
    const m = REASON_META[id] || REASON_META.other;
    return m[lang] || m.it;
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const dataUrl = fr.result;
        // Rimuovo prefix "data:image/...;base64,"
        const b64 = String(dataUrl).split(',')[1] || '';
        resolve({ b64, mime: file.type || 'image/jpeg' });
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

  const handleFileSelected = async (file) => {
    if (!file) return;
    setErr('');
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 6) {
      setErr((t('imp_err_too_large') || 'Immagine troppo grande (max 6 MB)') + ` — ${sizeMB.toFixed(1)} MB`);
      return;
    }

    setPreviewSrc(URL.createObjectURL(file));
    setStage('parsing');

    try {
      const { b64, mime } = await fileToBase64(file);
      const { data: { session: s } } = await supabase.auth.getSession();
      const token = s?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/parse-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          image_base64: b64,
          mime_type: mime,
          user_lang: lang || 'it',
        }),
      });

      if (res.status === 404) {
        setErr(t('imp_err_not_deployed') || 'La funzione di parsing non è ancora attiva sul server. Riprova più tardi.');
        setStage('upload');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setErr(data.error === 'parse_failed'
          ? (t('imp_err_parse_failed') || 'Non sono riuscito a leggere lo screenshot. Prova con una foto più nitida o ravvicinata.')
          : (data.detail || data.error || (t('imp_err_generic') || 'Errore durante l\'analisi.')));
        setStage('upload');
        return;
      }

      const items = (data.absences || []).map((a, i) => ({
        ...a,
        _id: i,
        _keep: true,
      }));
      if (items.length === 0) {
        setErr(t('imp_err_nothing_found') || 'Nessuna assenza riconosciuta nello screenshot. Verifica che siano visibili i codici dei voli/training.');
        setStage('upload');
        return;
      }
      setParsed(items);
      setDetectedMonth(data.detected_month);
      setStage('preview');
    } catch (e) {
      const isNetwork = e && (e.name === 'TypeError' || /load failed|failed to fetch/i.test(e.message || ''));
      setErr(isNetwork
        ? (t('imp_err_network') || 'Impossibile contattare il server. Controlla la connessione.')
        : (e.message || 'Errore'));
      setStage('upload');
    }
  };

  const updateItem = (id, patch) => {
    setParsed((prev) => prev.map((p) => p._id === id ? { ...p, ...patch } : p));
  };
  const toggleKeep = (id) => updateItem(id, { _keep: !parsed.find((p) => p._id === id)._keep });
  const toggleFamily = (fid) =>
    setVisibleFamilies((prev) => prev.includes(fid) ? prev.filter((x) => x !== fid) : [...prev, fid]);

  const confirmSave = async () => {
    setErr('');
    const toSave = parsed.filter((p) => p._keep);
    if (toSave.length === 0) {
      setErr(t('imp_err_nothing_to_save') || 'Nessuna assenza selezionata.');
      return;
    }
    setStage('saving');
    const rows = toSave.map((p) => ({
      user_id: session.user.id,
      member_name: profile?.display_name || profile?.full_name || session.user.email,
      start_date: p.start_date,
      end_date: p.end_date,
      reason: p.reason || 'other',
      location: p.location || null,
      note: p.note || null,
      visible_to_families: visibleFamilies,
    }));

    const { error } = await supabase.from('absences').insert(rows);
    if (error) {
      setErr(error.message);
      setStage('preview');
      return;
    }
    window.dispatchEvent(new CustomEvent('fammy_toast', {
      detail: {
        text: `✅ ${toSave.length} ${toSave.length === 1 ? (t('imp_toast_one') || 'assenza importata') : (t('imp_toast_many') || 'assenze importate')}`,
        tone: 'success',
      },
    }));
    onSaved && onSaved(toSave.length);
  };

  const kept = parsed.filter((p) => p._keep).length;

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="import-schedule-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>📸</span>
          <h2 style={{ flex: 1, margin: 0 }}>{t('imp_h') || 'Importa assenze da foto turno'}</h2>
          <button onClick={onClose} aria-label="close"
            style={{
              width: 34, height: 34, borderRadius: 10,
              border: '1px solid var(--sm)', background: 'white',
              fontSize: 14, cursor: 'pointer',
            }}>✕</button>
        </div>

        {/* ===== STAGE: UPLOAD ===== */}
        {stage === 'upload' && (
          <>
            <p className="modal-sub" style={{ marginTop: 0 }}>
              {t('imp_intro') || 'Carica uno screenshot del turno di lavoro. L\'AI riconoscerà voli, training e reperibilità, e ti mostrerà l\'anteprima delle assenze da creare.'}
            </p>
            <button
              type="button"
              data-testid="imp-pick-file"
              onClick={() => fileRef.current?.click()}
              style={{
                width: '100%', padding: '40px 20px', borderRadius: 16,
                border: '2px dashed var(--sm)', background: 'var(--ab)',
                cursor: 'pointer', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                marginTop: 8,
              }}>
              <span style={{ fontSize: 44 }}>🖼️</span>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--k)' }}>
                {t('imp_pick') || 'Scegli foto o scatta'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--km)' }}>
                {t('imp_pick_hint') || 'JPG / PNG · max 6 MB'}
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
              data-testid="imp-file-input"
            />

            {/* Tip box */}
            <div style={{
              marginTop: 14, padding: 12, borderRadius: 10,
              background: 'var(--gnB)', border: '1px solid #B8DAC7',
              fontSize: 12, color: 'var(--km)', lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 700, color: 'var(--gn)', marginBottom: 4 }}>
                💡 {t('imp_tip_title') || 'Cosa riconosco'}
              </div>
              {t('imp_tip_body') || 'Voli con pernotto (ORD, SEA, JFK…), giorni di training (SECCRM, EH…) e reperibilità (RES, RES_SB). Ignoro i giorni Rest / FREE / OFF.'}
            </div>

            {err && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 8,
                background: '#FDECEC', color: '#A93B2B',
                fontSize: 12, fontWeight: 600,
              }} data-testid="imp-err">{err}</div>
            )}
          </>
        )}

        {/* ===== STAGE: PARSING ===== */}
        {stage === 'parsing' && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            {previewSrc && (
              <img src={previewSrc} alt="" style={{
                maxWidth: '100%', maxHeight: 200, borderRadius: 10,
                margin: '0 auto 16px', display: 'block',
                opacity: 0.5,
              }} />
            )}
            <div style={{ display: 'inline-block', marginBottom: 12 }}>
              <span className="spin dark" style={{
                display: 'inline-block', width: 36, height: 36,
              }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {t('imp_analyzing') || 'Sto analizzando lo screenshot…'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 4 }}>
              {t('imp_analyzing_hint') || 'Possono volerci 10–20 secondi'}
            </div>
          </div>
        )}

        {/* ===== STAGE: PREVIEW ===== */}
        {stage === 'preview' && (
          <>
            <p className="modal-sub" style={{ marginTop: 0, marginBottom: 12 }}>
              {detectedMonth && (
                <strong>📅 {detectedMonth} · </strong>
              )}
              {t('imp_preview_intro') || 'Verifica le assenze trovate. Deseleziona o modifica prima di salvare.'}
            </p>

            <div style={{
              maxHeight: 360, overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '4px 2px', marginBottom: 12,
            }} data-testid="imp-preview-list">
              {parsed.map((p) => (
                <PreviewCard
                  key={p._id}
                  item={p}
                  onToggleKeep={() => toggleKeep(p._id)}
                  onChange={(patch) => updateItem(p._id, patch)}
                  reasonLabel={reasonLabel}
                  t={t}
                />
              ))}
            </div>

            {/* Visibilità famiglie */}
            {families.length > 0 && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)' }}>
                  {t('absence_visible_to') || 'Condividi con'}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {families.map((f) => {
                    const active = visibleFamilies.includes(f.id);
                    return (
                      <button key={f.id} type="button"
                        onClick={() => toggleFamily(f.id)}
                        data-testid={`imp-family-${f.id}`}
                        style={{
                          padding: '6px 12px', borderRadius: 100,
                          border: '1.5px solid',
                          borderColor: active ? 'var(--k)' : 'var(--sm)',
                          background: active ? 'var(--k)' : 'white',
                          color: active ? 'white' : 'var(--km)',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                        {active && <span>✓ </span>}{f.emoji} {f.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {err && (
              <div style={{
                marginTop: 12, padding: '10px 12px', borderRadius: 8,
                background: '#FDECEC', color: '#A93B2B',
                fontSize: 12, fontWeight: 600,
              }} data-testid="imp-err">{err}</div>
            )}

            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn secondary" onClick={() => setStage('upload')}>
                ← {t('imp_back') || 'Indietro'}
              </button>
              <button
                className="btn"
                onClick={confirmSave}
                disabled={kept === 0}
                data-testid="imp-save-btn">
                {t('imp_save') || 'Salva'} {kept > 0 && `(${kept})`}
              </button>
            </div>
          </>
        )}

        {/* ===== STAGE: SAVING ===== */}
        {stage === 'saving' && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <span className="spin dark" style={{ display: 'inline-block', width: 32, height: 32 }} />
            <div style={{ marginTop: 12, fontWeight: 700, fontSize: 14 }}>
              {t('imp_saving') || 'Salvataggio in corso…'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Riga di anteprima per ogni assenza estratta — editabile inline. */
function PreviewCard({ item, onToggleKeep, onChange, reasonLabel, t }) {
  const meta = REASON_META[item.reason] || REASON_META.other;
  return (
    <div style={{
      padding: 10, borderRadius: 12,
      border: '1px solid var(--sm)',
      background: item._keep ? 'white' : '#F5F0EA',
      opacity: item._keep ? 1 : 0.55,
      transition: 'background 0.15s, opacity 0.15s',
    }} data-testid={`imp-card-${item._id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={item._keep}
          onChange={onToggleKeep}
          data-testid={`imp-keep-${item._id}`}
          style={{ width: 18, height: 18, accentColor: 'var(--ac)', flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
            <span>{meta.icon}</span>
            <span>{reasonLabel(item.reason)}</span>
            {item.location && (
              <span style={{ color: 'var(--km)', fontWeight: 500 }}>· {item.location}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>
            📅 {fmt(item.start_date)} → {fmt(item.end_date)}
            {item.note && <span> · {item.note}</span>}
          </div>
        </div>
      </div>
      {item._keep && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <NativeDateInput value={item.start_date}
            onChange={(v) => onChange({ start_date: v })}
            placeholder={t('absence_start_ph') || 'Inizio'} />
          <NativeDateInput value={item.end_date}
            onChange={(v) => onChange({ end_date: v })}
            placeholder={t('absence_end_ph') || 'Fine'} />
        </div>
      )}
    </div>
  );
}

function fmt(d) {
  if (!d) return '?';
  try {
    return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch { return d; }
}
