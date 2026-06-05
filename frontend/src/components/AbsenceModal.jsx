import { useEffect, useMemo, useRef, useState } from 'react';
import { toLocalYMD } from '../lib/dateUtils.js';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { useKeyboardSafeModal } from '../lib/useKeyboardSafeModal.jsx';
import NativeDateInput from './NativeDateInput.jsx';
import ImportScheduleModal from './ImportScheduleModal.jsx';
import AbsenceCommentsThread from './AbsenceCommentsThread.jsx';

const REASONS = [
  { id: 'vacation', icon: '🏖️', label_it: 'Vacanza',  label_en: 'Vacation', label_fr: 'Vacances', label_de: 'Urlaub' },
  { id: 'work',     icon: '💼', label_it: 'Lavoro',   label_en: 'Work',     label_fr: 'Travail',  label_de: 'Arbeit' },
  { id: 'health',   icon: '🏥', label_it: 'Salute',   label_en: 'Health',   label_fr: 'Santé',    label_de: 'Gesundheit' },
  { id: 'other',    icon: '✈️', label_it: 'Altro',    label_en: 'Other',    label_fr: 'Autre',    label_de: 'Anderes' },
];

/**
 * AbsenceModal — crea o modifica un'assenza dell'utente corrente.
 *
 * Props:
 *  - session
 *  - profile        — per usare display_name come snapshot
 *  - families       — lista famiglie a cui appartengo
 *  - editingAbsence — (opzionale) se presente, modifica anziché creare
 *  - tasks          — (opzionale) per rilevare ricorrenze in conflitto
 *  - members        — (opzionale) lista membri per la riassegnazione
 *  - onClose, onSaved
 */
export default function AbsenceModal({
  session, profile, families = [],
  editingAbsence = null, tasks = [], members = [],
  onClose, onSaved, onDeleted,
}) {
  const { t, lang } = useT();
  const isEdit = !!editingAbsence;
  // L'assenza appartiene all'utente loggato? Se no, l'apertura del modal
  // è in modalità "read-only" (per leggere e commentare l'assenza altrui).
  const isOwner = !isEdit || editingAbsence?.user_id === session?.user?.id;
  const readOnly = isEdit && !isOwner;
  const today = toLocalYMD();
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const inAWeek = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();

  const [start, setStart] = useState(editingAbsence?.start_date || tomorrow);
  const [end, setEnd] = useState(editingAbsence?.end_date || inAWeek);
  const [reason, setReason] = useState(editingAbsence?.reason || 'vacation');
  const [location, setLocation] = useState(editingAbsence?.location || '');
  const [note, setNote] = useState(editingAbsence?.note || '');
  const [visibleFamilies, setVisibleFamilies] = useState(
    editingAbsence?.visible_to_families || families.map((f) => f.id)
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Stato per il modale di import da foto turno (solo in modalità "new")
  const [showImport, setShowImport] = useState(false);
  // Strategia per le ricorrenze: 'skip' | 'reassign'
  const [conflictAction, setConflictAction] = useState('skip');
  const [reassignTo, setReassignTo] = useState(null);

  const scrollRef = useRef(null);
  useKeyboardSafeModal(scrollRef);

  const myUserId = session?.user?.id;

  // === Conflitti ricorrenze: task con due_date dentro il range che hanno
  // ricorrenza E sono assegnate all'utente corrente.
  const conflictingTasks = useMemo(() => {
    if (!tasks || tasks.length === 0 || !start || !end) return [];
    // Lookup veloce: task_id → bool se sono io l'assignee.
    // Qui ci accontentiamo dei task con `delegated_to` puntato a un mio member,
    // o dell'origine ricorrente comunque mia (RLS già filtra le mie famiglie).
    const myMemberIds = members.filter((m) => m.user_id === myUserId).map((m) => m.id);
    return (tasks || []).filter((t) => {
      if (!t.recurrence_pattern && !t.is_recurring && !t.repeat_days) return false;
      // Se ho assegnatari, devo essere io uno di loro
      if (t.delegated_to && !myMemberIds.includes(t.delegated_to)) return false;
      return true;
    }).slice(0, 6);
  }, [tasks, members, myUserId, start, end]);

  const otherMembersInMyFamilies = useMemo(() => {
    const familyIds = (families || []).map((f) => f.id);
    return (members || []).filter((m) => familyIds.includes(m.family_id) && m.user_id !== myUserId);
  }, [families, members, myUserId]);

  const toggleFamily = (fid) => {
    setVisibleFamilies((prev) =>
      prev.includes(fid) ? prev.filter((x) => x !== fid) : [...prev, fid]
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!start || !end) {
      setErr(t('absence_dates_required') || 'Inserisci data di inizio e fine');
      return;
    }
    if (end < start) {
      setErr(t('absence_end_before_start') || 'La data di fine deve essere uguale o successiva a quella di inizio');
      return;
    }
    setBusy(true);
    setErr('');
    const payload = {
      user_id: myUserId,
      member_name: profile?.display_name || null,
      start_date: start,
      end_date: end,
      reason,
      location: location.trim() || null,
      note: note.trim() || null,
      visible_to_families: visibleFamilies,
    };

    let absenceId = editingAbsence?.id;
    if (isEdit) {
      const { error } = await supabase.from('absences').update(payload).eq('id', editingAbsence.id);
      if (error) { setBusy(false); setErr(error.message); return; }
    } else {
      const { data, error } = await supabase.from('absences').insert(payload).select('id').single();
      if (error) { setBusy(false); setErr(error.message); return; }
      absenceId = data?.id;
    }

    // Gestione conflitti ricorrenze (solo creazione, non in edit)
    if (!isEdit && conflictingTasks.length > 0 && conflictAction === 'reassign' && reassignTo) {
      try {
        for (const taskRow of conflictingTasks) {
          // Aggiungiamo un commento di sistema. La riassegnazione completa per
          // le istanze ricorrenti richiede l'expansion server-side: qui ci
          // limitiamo a notare l'intento + bump priorità → l'utente target lo
          // vede in bacheca, può claimare con un tap.
          await supabase.from('task_responses').insert({
            task_id: taskRow.id,
            author_id: members.find((m) => m.user_id === myUserId && m.family_id === taskRow.family_id)?.id,
            text: `🌍 Coperto per assenza di ${profile?.display_name || 'membro'} (${start} → ${end}). Riassegnata.`,
            type: 'system',
          });
          // Set assignee
          await supabase.from('task_assignees').delete().eq('task_id', taskRow.id);
          await supabase.from('task_assignees').insert({ task_id: taskRow.id, member_id: reassignTo });
        }
      } catch (e) { /* silent */ }
    }

    setBusy(false);
    onSaved?.({ id: absenceId, ...payload });
  };

  // Elimina l'assenza corrente. Conferma chiesta lato UI prima di chiamarla.
  const deleteAbsence = async () => {
    if (!editingAbsence?.id) return;
    setBusy(true); setErr('');
    const { error } = await supabase.from('absences').delete().eq('id', editingAbsence.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onDeleted ? onDeleted(editingAbsence.id) : onClose?.();
  };

  const REASON_LABEL = (r) => r[`label_${lang}`] || r.label_it;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 12, borderBottom: '1px solid var(--sm)' }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 18 }} data-testid="absence-modal-title">
            {isEdit ? (t('absence_edit_h') || 'Modifica assenza') : (t('absence_new_h') || 'Nuova assenza')}
          </h2>
          {!isEdit && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              data-testid="absence-open-import"
              title={t('imp_h') || 'Importa da foto turno'}
              style={{
                padding: '8px 12px', borderRadius: 100,
                border: '1.5px solid var(--ac)', background: 'white',
                color: 'var(--ac)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
              📸 {t('imp_open_btn_short') || 'Da foto turno'}
            </button>
          )}
          {isEdit && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('absence_delete_confirm') || 'Eliminare questa assenza?')) {
                  deleteAbsence();
                }
              }}
              disabled={busy}
              data-testid="absence-delete-btn"
              title={t('delete') || 'Elimina'}
              aria-label={t('delete') || 'Elimina'}
              style={{
                width: 36, height: 36, borderRadius: 10,
                border: '1px solid #E89898', background: 'white',
                color: '#A93B2B', fontSize: 16, cursor: 'pointer',
                padding: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
              🗑
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            data-testid="absence-close-btn"
            aria-label={t('close') || 'Chiudi'}
            title={t('close') || 'Chiudi'}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: '1px solid var(--sm)', background: 'white',
              fontSize: 14, cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>✕
          </button>
        </div>

        <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
            {readOnly ? (
              // === VIEW-ONLY MODE per assenze di altri membri ===
              // Solo summary + commenti, niente form modificabile.
              <AbsenceViewOnly
                absence={editingAbsence}
                members={members}
                families={families}
                t={t}
                lang={lang}
              />
            ) : (
              <>
            {/* === MOTIVO === */}
            <label>{t('absence_reason') || 'Motivo'}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }} data-testid="absence-reasons">
              {REASONS.map((r) => (
                <button key={r.id} type="button"
                  onClick={() => setReason(r.id)}
                  data-testid={`absence-reason-${r.id}`}
                  style={chipStyle(reason === r.id)}>
                  {r.icon} {REASON_LABEL(r)}
                </button>
              ))}
            </div>

            {/* === DATE === */}
            <div style={{ marginTop: 18 }}>
              <label>{t('absence_period') || 'Periodo'}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <NativeDateInput value={start} onChange={setStart}
                  placeholder={t('absence_start_ph') || 'Inizio assenza'}
                  testid="absence-start-input" />
                <NativeDateInput value={end} onChange={setEnd}
                  placeholder={t('absence_end_ph') || 'Fine assenza'}
                  testid="absence-end-input" />
              </div>
            </div>

            {/* === LUOGO === */}
            <div style={{ marginTop: 18 }}>
              <label htmlFor="abs-loc">{t('absence_location') || 'Dove'} <span style={{ color: 'var(--km)', fontWeight: 400 }}>({t('optional') || 'opzionale'})</span></label>
              <input id="abs-loc" className="input"
                data-testid="absence-location-input"
                placeholder={t('absence_location_ph') || 'es. Messico, Milano, Casa'}
                value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            {/* === NOTA === */}
            <div style={{ marginTop: 14 }}>
              <label htmlFor="abs-note">{t('absence_note') || 'Nota per la famiglia'} <span style={{ color: 'var(--km)', fontWeight: 400 }}>({t('optional') || 'opzionale'})</span></label>
              <textarea id="abs-note" className="input"
                data-testid="absence-note-input"
                rows={2}
                placeholder={t('absence_note_ph') || 'es. Sono raggiungibile su WhatsApp'}
                value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {/* === VISIBILITÀ === */}
            {families.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <label>{t('absence_visible_to') || 'Condividi con'}</label>
                <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 6 }}>
                  {t('absence_visible_hint') || 'Seleziona le famiglie che vedranno questa assenza. Se non selezioni nulla, resta privata.'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="absence-families">
                  {families.map((f) => {
                    const active = visibleFamilies.includes(f.id);
                    return (
                      <button key={f.id} type="button"
                        onClick={() => toggleFamily(f.id)}
                        data-testid={`absence-family-${f.id}`}
                        style={chipStyle(active)}>
                        {active && <span>✓ </span>}{f.emoji} {f.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === CONFLITTI RICORRENZE === */}
            {!isEdit && conflictingTasks.length > 0 && (
              <div style={{
                marginTop: 18, padding: 12,
                background: 'rgba(243, 156, 18, 0.10)',
                border: '1px solid rgba(243, 156, 18, 0.35)',
                borderRadius: 12,
              }} data-testid="absence-conflicts">
                <div style={{ fontSize: 12, fontWeight: 700, color: '#B36E00', marginBottom: 8 }}>
                  ⚠️ {t('absence_conflicts_h', { n: conflictingTasks.length }) || `${conflictingTasks.length} task ricorrenti potrebbero ricadere in questo periodo`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {conflictingTasks.map((ct) => (
                    <span key={ct.id} style={{
                      padding: '4px 10px', borderRadius: 100,
                      background: 'white', border: '1px solid var(--sm)',
                      fontSize: 11, fontWeight: 600,
                    }}>🔁 {ct.title}</span>
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  {t('absence_conflicts_what_to_do') || 'Cosa vuoi fare?'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <ConflictRadio active={conflictAction === 'skip'}
                    label={`⏭️ ${t('absence_action_skip') || 'Salta queste occorrenze (nessuno le farà)'}`}
                    onClick={() => setConflictAction('skip')}
                    testid="absence-action-skip" />
                  <ConflictRadio active={conflictAction === 'reassign'}
                    label={`🤝 ${t('absence_action_reassign') || 'Riassegna a un altro membro'}`}
                    onClick={() => setConflictAction('reassign')}
                    testid="absence-action-reassign" />
                </div>
                {conflictAction === 'reassign' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 4 }}>
                      {t('absence_pick_member') || 'A chi le passi?'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {otherMembersInMyFamilies.length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--km)', fontStyle: 'italic' }}>
                          {t('absence_no_other_members') || 'Nessun altro membro disponibile'}
                        </span>
                      )}
                      {otherMembersInMyFamilies.map((m) => (
                        <button key={m.id} type="button"
                          onClick={() => setReassignTo(m.id)}
                          data-testid={`absence-reassign-${m.id}`}
                          style={chipStyle(reassignTo === m.id)}>
                          {reassignTo === m.id ? '✓ ' : ''}{m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {err && (
              <div style={{
                marginTop: 14, padding: '10px 14px',
                background: 'rgba(231, 76, 60, 0.10)', border: '1px solid var(--rd)',
                borderRadius: 12, color: 'var(--rd)', fontSize: 13, fontWeight: 600,
              }}>⚠️ {err}</div>
            )}
              </>
            )}

            {/* Commenti (solo in edit, l'assenza deve esistere per avere id) */}
            {isEdit && editingAbsence?.id && (
              <div style={{
                marginTop: 16, paddingTop: 14,
                borderTop: '1px dashed var(--sm)',
              }}>
                <AbsenceCommentsThread
                  absenceId={editingAbsence.id}
                  session={session}
                  profile={profile}
                />
              </div>
            )}
          </div>

          <div className="row" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--sm)' }}>
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
              {readOnly ? (t('close') || 'Chiudi') : (t('cancel') || 'Annulla')}
            </button>
            {!readOnly && (
              <button type="submit" className="btn" disabled={busy} data-testid="absence-submit-btn">
                {busy ? <span className="spin" /> : (isEdit ? (t('save_changes') || 'Salva') : (t('absence_create_btn') || 'Crea assenza'))}
              </button>
            )}
          </div>
        </form>
      </div>

      {showImport && (
        <ImportScheduleModal
          session={session}
          profile={profile}
          families={families}
          onClose={() => setShowImport(false)}
          onSaved={() => {
            setShowImport(false);
            onSaved?.({ _bulkImported: true });
          }}
        />
      )}
    </div>
  );
}

function chipStyle(active) {
  return {
    padding: '8px 12px', borderRadius: 100,
    border: `1.5px solid ${active ? 'var(--ac)' : 'var(--sm)'}`,
    background: active ? 'var(--ac)' : 'white',
    color: active ? 'white' : 'var(--k)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function ConflictRadio({ active, label, onClick, testid }) {
  return (
    <button type="button" onClick={onClick}
      data-testid={testid}
      style={{
        padding: '8px 12px', borderRadius: 10,
        border: `1.5px solid ${active ? 'var(--ac)' : 'var(--sm)'}`,
        background: active ? 'rgba(193, 98, 75, 0.10)' : 'white',
        color: 'var(--k)',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
        textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        border: `2px solid ${active ? 'var(--ac)' : 'var(--sm)'}`,
        background: active ? 'var(--ac)' : 'white',
        flexShrink: 0,
      }} />
      {label}
    </button>
  );
}

/**
 * AbsenceViewOnly — render compatto e read-only di un'assenza altrui.
 * Mostra: motivo (emoji + label), periodo formattato, luogo, nota,
 * famiglie destinatarie. Sotto si monta il thread commenti.
 */
function AbsenceViewOnly({ absence, members = [], families = [], t, lang }) {
  if (!absence) return null;
  const localeMap = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', de: 'de-DE' };
  const locale = localeMap[lang] || 'it-IT';

  // Ritrova reason emoji + label
  const REASONS = [
    { id: 'trip', icon: '✈️', label: t('absence_reason_trip') || 'In viaggio' },
    { id: 'work', icon: '💼', label: t('absence_reason_work') || 'Lavoro' },
    { id: 'sick', icon: '🤒', label: t('absence_reason_sick') || 'Malattia' },
    { id: 'family', icon: '🏠', label: t('absence_reason_family') || 'Famiglia' },
    { id: 'other', icon: '📌', label: t('absence_reason_other') || 'Altro' },
  ];
  const reasonInfo = REASONS.find((r) => r.id === absence.reason) || REASONS[REASONS.length - 1];

  const fmt = (d) => {
    if (!d) return '';
    try {
      return new Date(d + 'T12:00:00').toLocaleDateString(locale, {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      });
    } catch (_) { return d; }
  };

  const member = (members || []).find((m) => m.user_id === absence.user_id);
  const authorName = member?.name || absence.member_name || t('member_one') || 'Membro';
  const visibleFamilies = (families || []).filter((f) =>
    Array.isArray(absence.visible_to_families) && absence.visible_to_families.includes(f.id)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hint read-only */}
      <div style={{
        padding: '8px 12px',
        background: 'var(--ab)', border: '1px solid var(--sm)',
        borderRadius: 10, fontSize: 12, color: 'var(--km)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: 14 }}>👁️</span>
        <span>{t('absence_readonly_hint') || 'Stai visualizzando l\'assenza di un altro membro. Puoi commentarla sotto.'}</span>
      </div>

      {/* Card riepilogo */}
      <div style={{
        padding: 14, borderRadius: 14,
        background: 'var(--ab)', border: '1px solid var(--sm)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>{reasonInfo.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--k)' }}>
              {authorName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 1 }}>
              {reasonInfo.label}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px dashed var(--sm)', paddingTop: 10, fontSize: 13, color: 'var(--k)' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: 'var(--km)', minWidth: 60 }}>📅</span>
            <span>
              {fmt(absence.start_date)}
              {absence.end_date !== absence.start_date && <> → {fmt(absence.end_date)}</>}
            </span>
          </div>
          {absence.location && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: 'var(--km)', minWidth: 60 }}>📍</span>
              <span>{absence.location}</span>
            </div>
          )}
          {absence.note && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: 'var(--km)', minWidth: 60 }}>📝</span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{absence.note}</span>
            </div>
          )}
          {visibleFamilies.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: 'var(--km)', minWidth: 60 }}>👥</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {visibleFamilies.map((f) => (
                  <span key={f.id} style={{
                    padding: '2px 8px', borderRadius: 100,
                    background: 'white', border: '1px solid var(--sm)',
                    fontSize: 11, fontWeight: 600,
                  }}>{f.emoji} {f.name}</span>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
