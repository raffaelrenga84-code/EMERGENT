import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * MedicationsModal — gestione medicine di un membro assistito.
 *
 * Mostra:
 *   - Lista medicine attive con orari
 *   - "+ Nuova medicina" → form inline (nome, dose, orari array, note)
 *   - "Storico oggi" → log delle prese di oggi (📋)
 *   - Per ogni medicina: edit / elimina
 *
 * Props:
 *   - member: il member assistito di cui gestiamo le medicine
 *   - me: il member loggato (per `recorded_by` nei log e `created_by`)
 *   - onClose
 */
export default function MedicationsModal({ member, me, onClose }) {
  const { t } = useT();
  const [meds, setMeds] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const [{ data: m }, { data: logs }] = await Promise.all([
      supabase.from('medications')
        .select('*').eq('member_id', member.id).eq('active', true)
        .order('created_at'),
      supabase.from('medication_logs')
        .select('*').eq('member_id', member.id)
        .gte('scheduled_at', startOfToday().toISOString())
        .lte('scheduled_at', endOfToday().toISOString())
        .order('scheduled_at', { ascending: false }),
    ]);
    setMeds(m || []);
    setTodayLogs(logs || []);
    setLoading(false);
  };

  useEffect(() => {
    if (member?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const onSaved = async () => {
    setShowForm(false);
    setEditing(null);
    await load();
  };

  const removeMed = async (med) => {
    if (!confirm(t('med_delete_confirm', { name: med.name }) ||
      `Eliminare la medicina "${med.name}"?`)) return;
    await supabase.from('medications').update({ active: false }).eq('id', med.id);
    await load();
  };

  return (
    <div className="modal-bg" onClick={onClose} data-testid="medications-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: member.avatar_color || 'var(--ac)',
            color: 'white', fontSize: 18, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {member.avatar_letter || member.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              💊 {t('med_h') || 'Medicine'}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--km)' }}>
              {member.name}
            </div>
          </div>
          <button onClick={onClose} className="profile-btn">✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {loading ? (
            <div style={{ color: 'var(--km)', padding: 20, textAlign: 'center' }}>
              {t('loading') || 'Caricamento…'}
            </div>
          ) : (
            <>
              {showForm || editing ? (
                <MedicationForm
                  member={member}
                  me={me}
                  med={editing}
                  onCancel={() => { setShowForm(false); setEditing(null); }}
                  onSaved={onSaved}
                />
              ) : (
                <>
                  {/* Lista medicine */}
                  {meds.length === 0 ? (
                    <div style={{
                      padding: '28px 16px', textAlign: 'center',
                      color: 'var(--km)', fontSize: 14,
                    }}>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>💊</div>
                      {t('med_empty') || 'Nessuna medicina ancora.'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {meds.map((med) => (
                        <MedicationCard key={med.id} med={med}
                          todayLogs={todayLogs.filter((l) => l.medication_id === med.id)}
                          onEdit={() => setEditing(med)}
                          onRemove={() => removeMed(med)} />
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn full"
                    onClick={() => setShowForm(true)}
                    data-testid="medications-add-btn"
                    style={{ marginTop: 14 }}>
                    + {t('med_add_btn') || 'Nuova medicina'}
                  </button>

                  {/* Storico oggi */}
                  {todayLogs.length > 0 && (
                    <div style={{ marginTop: 22 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 700, color: 'var(--km)',
                        textTransform: 'uppercase', marginBottom: 8,
                      }}>
                        📋 {t('med_today_log') || 'Storico oggi'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {todayLogs.map((l) => {
                          const med = meds.find((m) => m.id === l.medication_id);
                          return (
                            <div key={l.id} style={{
                              padding: '8px 10px',
                              background: 'var(--ab)', borderRadius: 8,
                              fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                              <span style={{ fontSize: 14 }}>
                                {l.action === 'taken' ? '✅' :
                                 l.action === 'snoozed' ? '⏰' : '⏭️'}
                              </span>
                              <span style={{ flex: 1 }}>
                                {med?.name || '?'} ·{' '}
                                {new Date(l.scheduled_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span style={{ color: 'var(--km)' }}>
                                {l.action === 'taken' ? (t('med_action_taken') || 'presa') :
                                 l.action === 'snoozed' ? (t('med_action_snoozed') || 'posticipata') :
                                 (t('med_action_skipped') || 'saltata')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MedicationCard({ med, todayLogs, onEdit, onRemove }) {
  const { t } = useT();
  // Per ogni `time_of_day`, controlla se è già stato preso oggi
  const todayTakenTimes = new Set(
    todayLogs
      .filter((l) => l.action === 'taken')
      .map((l) => new Date(l.scheduled_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }))
  );

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>💊 {med.name}</div>
          {med.dose && (
            <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>
              {med.dose}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button type="button" onClick={onEdit}
            data-testid={`med-edit-${med.id}`}
            style={{
              padding: '4px 8px', borderRadius: 6,
              background: 'var(--ab)', border: '1px solid var(--sm)',
              fontSize: 12, cursor: 'pointer',
            }}>✏️</button>
          <button type="button" onClick={onRemove}
            data-testid={`med-remove-${med.id}`}
            style={{
              padding: '4px 8px', borderRadius: 6,
              background: 'var(--ab)', border: '1px solid var(--sm)',
              fontSize: 12, cursor: 'pointer', color: 'var(--rd)',
            }}>🗑️</button>
        </div>
      </div>

      {med.times_of_day && med.times_of_day.length > 0 ? (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {med.times_of_day.map((time) => {
            const taken = todayTakenTimes.has(time);
            return (
              <span key={time} style={{
                padding: '4px 10px', borderRadius: 100,
                background: taken ? 'var(--gnB)' : 'var(--ab)',
                color: taken ? 'var(--gn)' : 'var(--k)',
                border: taken ? '1px solid var(--gn)' : '1px solid var(--sm)',
                fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                {taken && '✓ '}🕒 {time}
              </span>
            );
          })}
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--km)' }}>
          {t('med_as_needed') || 'Al bisogno'}
        </div>
      )}

      {med.notes && (
        <div style={{
          marginTop: 8, fontSize: 12, color: 'var(--km)',
          fontStyle: 'italic', lineHeight: 1.4,
        }}>
          {med.notes}
        </div>
      )}
    </div>
  );
}

function MedicationForm({ member, me, med, onCancel, onSaved }) {
  const { t } = useT();
  const [name, setName] = useState(med?.name || '');
  const [dose, setDose] = useState(med?.dose || '');
  const [notes, setNotes] = useState(med?.notes || '');
  const [times, setTimes] = useState(med?.times_of_day || []);
  const [newTime, setNewTime] = useState('08:00');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const addTime = () => {
    if (!newTime) return;
    if (times.includes(newTime)) return;
    setTimes([...times, newTime].sort());
  };
  const removeTime = (t) => setTimes(times.filter((x) => x !== t));

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr(t('med_err_name') || 'Inserisci il nome della medicina.');
      return;
    }
    setBusy(true);
    setErr('');
    const payload = {
      member_id: member.id,
      name: name.trim(),
      dose: dose.trim() || null,
      notes: notes.trim() || null,
      times_of_day: times,
      ...(med ? {} : { created_by: me?.id || null }),
    };
    const { error } = med
      ? await supabase.from('medications').update(payload).eq('id', med.id)
      : await supabase.from('medications').insert(payload);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <form onSubmit={submit} data-testid="medication-form">
      <h3 style={{ marginTop: 0 }}>
        {med ? (t('med_edit_h') || 'Modifica medicina') : (t('med_add_h') || 'Nuova medicina')}
      </h3>

      <label>{t('med_name_label') || 'Nome'}</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)}
        placeholder={t('med_name_ph') || 'es. Cardioaspirina'}
        autoFocus required
        data-testid="med-form-name" />

      <label style={{ marginTop: 10 }}>{t('med_dose_label') || 'Dose'}</label>
      <input className="input" value={dose} onChange={(e) => setDose(e.target.value)}
        placeholder={t('med_dose_ph') || 'es. 100 mg, 1 pastiglia'}
        data-testid="med-form-dose" />

      <label style={{ marginTop: 10 }}>{t('med_times_label') || 'Orari di assunzione'}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {times.map((time) => (
          <span key={time} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 100,
            background: 'var(--ab)', border: '1px solid var(--sm)',
            fontSize: 12, fontWeight: 600,
          }}>
            🕒 {time}
            <button type="button" onClick={() => removeTime(time)}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--rd)', cursor: 'pointer', padding: 0,
                fontSize: 14, lineHeight: 1,
              }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)}
          className="input" style={{ flex: 1 }}
          data-testid="med-form-time-picker" />
        <button type="button" onClick={addTime} className="profile-btn"
          data-testid="med-form-add-time">
          + {t('add') || 'Aggiungi'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
        {t('med_times_hint') || 'Lascia vuoto se la medicina è "al bisogno" (no reminder)'}
      </p>

      <label style={{ marginTop: 10 }}>{t('med_notes_label') || 'Note'}</label>
      <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder={t('med_notes_ph') || 'es. dopo i pasti, con un bicchiere d\'acqua'}
        rows={2} data-testid="med-form-notes" />

      {err && (
        <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn secondary" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="submit" className="btn" disabled={busy}
          data-testid="med-form-submit">
          {busy ? <span className="spin" /> : (t('save') || 'Salva')}
        </button>
      </div>
    </form>
  );
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfToday() {
  const d = startOfToday();
  return new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1);
}
