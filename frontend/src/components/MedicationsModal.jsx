import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import MedicalProfileSection from './MedicalProfileSection.jsx';
import DailyDiarySection from './DailyDiarySection.jsx';
import CareAttachments from './CareAttachments.jsx';
import CareReportShare from './CareReportShare.jsx';
import { getCanonicalMember } from '../lib/personScope.js';

/**
 * MedicationsModal (alias Care Hub) — modale unica per la gestione delle
 * funzioni di assistenza di un membro: medicine, profilo medico, diario.
 *
 * Tab:
 *   💊 Medicine — CRUD farmaci, lista presa oggi
 *   🩺 Profilo medico — gruppo sanguigno, allergie, contatti emergenza
 *   📓 Diario — mood/sonno/appetito/note giornaliere
 *
 * Props:
 *   - member: il member assistito
 *   - me: il member loggato
 *   - onClose
 *   - initialTab?: 'meds' | 'profile' | 'diary' (default 'meds')
 */
export default function MedicationsModal({ member: rawMember, me, onClose, initialTab = 'meds' }) {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [meds, setMeds] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showShare, setShowShare] = useState(false);
  // Membri della famiglia (per derivare i caregiver assegnati)
  const [familyMembers, setFamilyMembers] = useState([]);
  // CONSOLIDAMENTO: se la persona ha user_id, ridirigi al "primary member"
  // canonico (la row con id più piccolo) così tutte le medicine, profilo
  // medico, diario, allegati convergono lì → coerenti indipendentemente
  // dalla famiglia da cui si apre il Care Hub.
  const [member, setMember] = useState(rawMember);

  // Risolvi canonical primary appena entra il modale (se utente con user_id)
  useEffect(() => {
    let cancelled = false;
    if (!rawMember?.user_id) {
      setMember(rawMember);
      return;
    }
    supabase.from('members')
      .select('*')
      .eq('user_id', rawMember.user_id)
      .order('id', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        const all = data || [];
        const canonical = getCanonicalMember(rawMember, all) || rawMember;
        setMember(canonical);
      });
    return () => { cancelled = true; };
  }, [rawMember]);

  // Carica i membri della famiglia (una volta)
  useEffect(() => {
    let cancelled = false;
    if (!member.family_id) return;
    supabase.from('members')
      .select('id, name, avatar_letter, avatar_color, family_id, user_id')
      .eq('family_id', member.family_id)
      .then(({ data }) => {
        if (!cancelled) setFamilyMembers(data || []);
      });
    return () => { cancelled = true; };
  }, [member.family_id]);

  const caregivers = (member.cared_by || [])
    .map((id) => familyMembers.find((m) => m.id === id))
    .filter(Boolean);

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
              🩺 {t('care_hub_h') || 'Assistenza'}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--km)' }}>
              {member.name}
              {caregivers.length > 0 && (
                <span data-testid="care-hub-caregivers-badge" style={{
                  marginLeft: 8, padding: '2px 8px', borderRadius: 100,
                  background: 'var(--gnB)', color: 'var(--gn)',
                  fontSize: 10, fontWeight: 700,
                }}>
                  🤝 {caregivers.map((c) => c.name).join(', ')}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowShare(true)}
            data-testid="care-share-btn"
            title={t('crs_share_h') || 'Condividi report'}
            className="profile-btn"
            style={{ marginRight: 4 }}>
            📤
          </button>
          <button onClick={onClose} className="profile-btn">✕</button>
        </div>

        {/* Tab strip: 💊 Medicine · 🩺 Profilo · 📓 Diario */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 12,
          padding: 4, background: 'var(--ab)', borderRadius: 12,
        }}>
          {[
            { id: 'meds',    icon: '💊', label: t('care_tab_meds')    || 'Medicine' },
            { id: 'profile', icon: '🩺', label: t('care_tab_profile') || 'Profilo'  },
            { id: 'diary',   icon: '📓', label: t('care_tab_diary')   || 'Diario'   },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              data-testid={`care-tab-${tab.id}`}
              style={{
                flex: 1, padding: '8px 6px', borderRadius: 8,
                background: activeTab === tab.id ? 'white' : 'transparent',
                color: activeTab === tab.id ? 'var(--k)' : 'var(--km)',
                border: 'none',
                fontSize: 12, fontWeight: 700,
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {/* TAB: PROFILO MEDICO */}
          {activeTab === 'profile' && (
            <MedicalProfileSection member={member} me={me} />
          )}

          {/* TAB: DIARIO */}
          {activeTab === 'diary' && (
            <DailyDiarySection member={member} me={me} />
          )}

          {/* TAB: MEDICINE */}
          {activeTab === 'meds' && (loading ? (
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
                          member={member}
                          meId={me?.id}
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
          ))}
        </div>
      </div>

      {/* Bottom-sheet condivisione report sanitario */}
      {showShare && (
        <CareReportShare member={member} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

function MedicationCard({ med, member, meId, todayLogs, onEdit, onRemove }) {
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

      {/* Allegati per la medicina (foto confezione, bugiardino, ricetta) */}
      {member?.id && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--sm)' }}>
          <CareAttachments
            memberId={member.id}
            kind="medication"
            parentId={med.id}
            meId={meId}
            compact
          />
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
