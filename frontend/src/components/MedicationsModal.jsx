import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import MedicalProfileSection from './MedicalProfileSection.jsx';
import DailyDiarySection from './DailyDiarySection.jsx';
import CareAttachments from './CareAttachments.jsx';
import CareReportShare from './CareReportShare.jsx';
import HealthTrendsCard from './HealthTrendsCard.jsx';
import { getCanonicalMember } from '../lib/personScope.js';
import { toLocalYMD } from '../lib/dateUtils.js';
import { activeTimesForToday, isMedDueOn } from '../lib/medSchedule.js';

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
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [activeTab, setActiveTab] = useState(initialTab);
  const [meds, setMeds] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [doctorInfo, setDoctorInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showShare, setShowShare] = useState(false);
  // Dirty: il form medicina ha modifiche non salvate (per warning su X/backdrop)
  const [formDirty, setFormDirty] = useState(false);
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
    const [{ data: m }, { data: logs }, { data: mp }] = await Promise.all([
      supabase.from('medications')
        .select('*').eq('member_id', member.id).eq('active', true)
        .order('created_at'),
      supabase.from('medication_logs')
        .select('*').eq('member_id', member.id)
        .gte('scheduled_at', startOfToday().toISOString())
        .lte('scheduled_at', endOfToday().toISOString())
        .order('scheduled_at', { ascending: false }),
      supabase.from('medical_profiles')
        .select('doctor_name, doctor_phone, doctor_email')
        .eq('member_id', member.id).maybeSingle(),
    ]);
    setMeds(m || []);
    setTodayLogs(logs || []);
    setDoctorInfo(mp || null);
    setLoading(false);
  };

  useEffect(() => {
    if (member?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const onSaved = async () => {
    setShowForm(false);
    setEditing(null);
    setFormDirty(false);
    await load();
  };

  // Wrapper di chiusura: se il form medicina ha modifiche non salvate,
  // chiedi conferma prima di scartare. Bug fix utente 13 giu:
  // "premo X pensando sia Salva e perdo le modifiche".
  const handleClose = () => {
    if (formDirty && (showForm || editing)) {
      const msg = t('med_form_dirty_confirm') ||
        'Hai modifiche non salvate sulla medicina. Vuoi davvero chiudere senza salvare?';
      if (!confirm(msg)) return;
    }
    onClose();
  };

  const removeMed = async (med) => {
    if (!confirm(t('med_delete_confirm', { name: med.name }) ||
      `Eliminare la medicina "${med.name}"?`)) return;
    await supabase.from('medications').update({ active: false }).eq('id', med.id);
    await load();
  };

  return (
    <div className="modal-bg" onClick={handleClose} data-testid="medications-modal">
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
          <button onClick={handleClose} className="profile-btn">✕</button>
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
            <>
              <HealthTrendsCard member={member} />
              <MedicalProfileSection member={member} me={me} />
            </>
          )}

          {/* TAB: DIARIO */}
          {activeTab === 'diary' && (
            <DailyDiarySection member={member} me={me} onSaved={onClose} />
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
                  onCancel={() => { setShowForm(false); setEditing(null); setFormDirty(false); }}
                  onSaved={onSaved}
                  onDirtyChange={setFormDirty}
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
                          doctor={doctorInfo}
                          onRefresh={load}
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

function MedicationCard({ med, member, meId, todayLogs, doctor, onRefresh, onEdit, onRemove }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  // === Scorte: giorni rimanenti stimati ===
  // dosi/giorno = orari di oggi ÷ intervallo (es. 2 orari a giorni alterni = 1/die)
  const supplyInfo = (() => {
    if (med.supply_left === null || med.supply_left === undefined) return null;
    const left = Number(med.supply_left);
    const todayY0 = toLocalYMD(new Date());
    const perDue = activeTimesForToday(med, todayY0).length;
    const interval = Number(med.interval_days) || 1;
    const rate = perDue > 0 ? perDue / interval : 0;
    const daysLeft = rate > 0 ? Math.floor(left / rate) : null;
    const low = (daysLeft !== null && daysLeft <= 7) || left <= 5;
    return { left, daysLeft, low };
  })();

  const refillSupply = async () => {
    const total = Number(med.supply_total) || 0;
    const newLeft = total > 0 ? Number(med.supply_left || 0) + total : Number(med.supply_total || med.supply_left || 0);
    await supabase.from('medications')
      .update({ supply_left: newLeft, supply_alert_sent: false })
      .eq('id', med.id);
    onRefresh?.();
  };

  const doctorMsg = () => {
    const days = supplyInfo?.daysLeft;
    return (
      `Buongiorno${doctor?.doctor_name ? ' ' + doctor.doctor_name : ' dottore'}, ` +
      `la medicina ${med.name}${med.dose ? ` (${med.dose})` : ''} di ${member.name} ` +
      `sta per terminare${days !== null && days !== undefined ? ` (circa ${days} giorni di scorte)` : ''}. ` +
      `Potrebbe cortesemente preparare una nuova prescrizione? Grazie mille!`
    );
  };
  const waHref = () => {
    const phone = (doctor?.doctor_phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(doctorMsg())}`;
  };
  const mailHref = () =>
    `mailto:${doctor?.doctor_email}?subject=${encodeURIComponent(`Richiesta ricetta: ${med.name} per ${member.name}`)}&body=${encodeURIComponent(doctorMsg())}`;

  // === Storico ultimi 14 giorni (caricato solo quando si apre) ===
  const [histOpen, setHistOpen] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [histLogs, setHistLogs] = useState(null);

  const toggleHistory = async () => {
    if (histOpen) { setHistOpen(false); return; }
    setHistOpen(true);
    if (histLogs !== null) return; // già caricato
    setHistLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 13);
    since.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('medication_logs')
      .select('scheduled_at, acted_at, action, note')
      .eq('medication_id', med.id)
      .gte('scheduled_at', since.toISOString())
      .order('scheduled_at', { ascending: false });
    setHistLogs(data || []);
    setHistLoading(false);
  };

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
          {Array.isArray(med.days_of_week) && med.days_of_week.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ac)', fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>
              🗓️ {[1, 2, 3, 4, 5, 6, 0].filter((d) => med.days_of_week.includes(d))
                .map((d) => new Date(2026, 5, 7 + d).toLocaleDateString(undefined, { weekday: 'short' })).join(', ')}
            </div>
          )}
          {Number(med.cycle_on_days) > 0 && Number(med.cycle_off_days) > 0 && (
            <div style={{ fontSize: 12, color: 'var(--ac)', fontWeight: 600, marginTop: 2 }}>
              🔁 {med.cycle_on_days} {t('med_cycle_on_short') || 'sì'} / {med.cycle_off_days} {t('med_cycle_off_short') || 'pausa'}
            </div>
          )}
          {Number(med.interval_days) > 1 && (
            <div style={{ fontSize: 12, color: 'var(--ac)', fontWeight: 600, marginTop: 2 }}>
              📆 {Number(med.interval_days) === 2
                ? (t('med_interval_alt') || 'A giorni alterni')
                : `${t('med_interval_every') || 'Ogni'} ${med.interval_days} ${t('med_interval_days') || 'giorni'}`}
            </div>
          )}
          {supplyInfo && !supplyInfo.low && (
            <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>
              📦 {supplyInfo.left} {t('med_supply_doses') || 'dosi'}
              {supplyInfo.daysLeft !== null && ` · ~${supplyInfo.daysLeft} ${t('med_interval_days') || 'giorni'}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button type="button" onClick={toggleHistory}
            data-testid={`med-history-${med.id}`}
            style={{
              padding: '4px 8px', borderRadius: 6,
              background: histOpen ? 'var(--ac)' : 'var(--ab)',
              border: histOpen ? '1px solid var(--ac)' : '1px solid var(--sm)',
              fontSize: 12, cursor: 'pointer',
            }}>📊</button>
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

      {(() => {
        const today = toLocalYMD(new Date());
        const ended = med.end_date && med.end_date < today;
        const notStarted = med.start_date && med.start_date > today;
        const todayTimes = activeTimesForToday(med, today);
        const dueToday = isMedDueOn(med, today);
        const fmtD = (ymd) => new Date(ymd + 'T12:00:00')
          .toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        const futurePhases = (Array.isArray(med.schedule_phases) ? med.schedule_phases : [])
          .filter((p) => p?.from && p.from > today)
          .sort((a, b) => a.from.localeCompare(b.from));
        return (
          <>
            {/* Periodo di assunzione */}
            {(med.start_date || med.end_date) && (
              <div style={{ marginTop: 6, fontSize: 11, color: ended ? 'var(--rd)' : 'var(--km)', fontWeight: 600 }}>
                {ended
                  ? `✅ ${t('med_ended') || 'Cura terminata'} (${fmtD(med.end_date)})`
                  : `📅 ${med.start_date ? fmtD(med.start_date) : '…'} → ${med.end_date ? fmtD(med.end_date) : '∞'}`}
              </div>
            )}
            {!ended && !notStarted && !dueToday ? (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--km)', fontWeight: 600 }}>
                💤 {t('med_not_due_today') || 'Oggi non va presa'}
              </div>
            ) : !ended && !notStarted && todayTimes.length > 0 ? (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {todayTimes.map((time) => {
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
            ) : (!ended && !notStarted) ? (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--km)' }}>
                {t('med_as_needed') || 'Al bisogno'}
              </div>
            ) : null}
            {/* Prossimi cambi di frequenza */}
            {!ended && futurePhases.map((p) => (
              <div key={p.from} style={{ marginTop: 4, fontSize: 11, color: 'var(--km)' }}>
                🔁 {t('med_phase_upcoming') || 'Dal'} {fmtD(p.from)}: {(p.times || []).map((x) => `🕒 ${x}`).join(' ')}
              </div>
            ))}
          </>
        );
      })()}

      {/* === Scorte in esaurimento: chiedi la ricetta con un tocco === */}
      {supplyInfo?.low && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 10,
          background: 'rgba(212,163,91,0.14)',
          border: '1px solid rgba(212,163,91,0.45)',
        }} data-testid={`med-supply-low-${med.id}`}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#B36E00', marginBottom: 2 }}>
            📦 {t('med_supply_low_h') || 'Sta per finire'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--k)', marginBottom: 8 }}>
            {supplyInfo.left} {t('med_supply_doses') || 'dosi'}
            {supplyInfo.daysLeft !== null &&
              ` (~${supplyInfo.daysLeft} ${t('med_interval_days') || 'giorni'})`}
            {' — '}{t('med_supply_low_p') || 'chiedi la nuova ricetta al medico:'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {doctor?.doctor_phone && (
              <a href={waHref()} target="_blank" rel="noreferrer"
                data-testid={`med-supply-wa-${med.id}`}
                style={{
                  padding: '8px 12px', borderRadius: 100, textDecoration: 'none',
                  background: '#25D366', color: 'white', fontSize: 12, fontWeight: 700,
                }}>
                💬 WhatsApp {doctor.doctor_name ? `a ${doctor.doctor_name}` : (t('med_supply_doctor') || 'al medico')}
              </a>
            )}
            {doctor?.doctor_email && (
              <a href={mailHref()}
                data-testid={`med-supply-mail-${med.id}`}
                style={{
                  padding: '8px 12px', borderRadius: 100, textDecoration: 'none',
                  background: 'var(--ac)', color: 'white', fontSize: 12, fontWeight: 700,
                }}>
                ✉️ Email
              </a>
            )}
            <button type="button" onClick={refillSupply}
              data-testid={`med-supply-refill-${med.id}`}
              style={{
                padding: '8px 12px', borderRadius: 100,
                background: 'var(--w, #fff)', border: '1px solid var(--sm)',
                color: 'var(--k)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
              ✅ {t('med_supply_refill') || 'Ricomprata'}
            </button>
          </div>
          {!doctor?.doctor_phone && !doctor?.doctor_email && (
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 6 }}>
              💡 {t('med_supply_no_doctor') ||
                'Aggiungi telefono o email del medico nel Profilo medico per inviare la richiesta con un tocco.'}
            </div>
          )}
        </div>
      )}

      {/* === Storico ultimi 14 giorni === */}
      {histOpen && (
        <div style={{
          marginTop: 10, padding: 10, borderRadius: 10,
          background: 'var(--ab)', border: '1px solid var(--sm)',
        }} data-testid={`med-history-panel-${med.id}`}>
          {histLoading || histLogs === null ? (
            <div style={{ fontSize: 12, color: 'var(--km)' }}>⏳ {t('loading') || 'Caricamento…'}</div>
          ) : (() => {
            // Costruisce gli ultimi 14 giorni (dal più vecchio a oggi)
            const days = [];
            for (let i = 13; i >= 0; i--) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              days.push(toLocalYMD(d));
            }
            const todayY = toLocalYMD(new Date());
            // Log raggruppati per giorno locale
            const byDay = new Map();
            for (const l of histLogs) {
              const ymd = toLocalYMD(new Date(l.scheduled_at));
              const arr = byDay.get(ymd) || [];
              arr.push(l);
              byDay.set(ymd, arr);
            }
            let expTot = 0;
            let takenTot = 0;
            const cells = days.map((ymd) => {
              const due = isMedDueOn(med, ymd);
              const expected = due ? activeTimesForToday(med, ymd).length : 0;
              const dayLogs = byDay.get(ymd) || [];
              const takenN = dayLogs.filter((l) => l.action === 'taken').length;
              const skippedN = dayLogs.filter((l) => l.action === 'skipped').length;
              if (expected > 0) { expTot += expected; takenTot += Math.min(takenN, expected); }
              let bg = 'white', color = 'var(--km)', label = '·', border = '1px solid var(--sm)';
              if (!due || expected === 0) {
                label = '·';                                   // giorno di pausa / al bisogno
              } else if (takenN >= expected) {
                bg = 'var(--gn)'; color = 'white'; label = '✓'; border = '1px solid var(--gn)';
              } else if (takenN > 0) {
                bg = '#D4A35B'; color = 'white'; label = '½'; border = '1px solid #D4A35B';
              } else if (skippedN > 0) {
                bg = 'var(--rd)'; color = 'white'; label = '✕'; border = '1px solid var(--rd)';
              } else if (ymd === todayY) {
                label = '…';                                    // oggi, ancora in corso
              } else {
                label = '○';                                    // nessuna registrazione
              }
              const dayNum = Number(ymd.slice(8, 10));
              return (
                <div key={ymd} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, background: bg, color,
                    border, fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{label}</div>
                  <div style={{ fontSize: 8, color: 'var(--km)' }}>{dayNum}</div>
                </div>
              );
            });
            const pct = expTot > 0 ? Math.round((takenTot / expTot) * 100) : null;
            const notedLogs = histLogs.filter((l) => l.note).slice(0, 5);
            const fmtDT = (iso) => new Date(iso)
              .toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
            const actIcon = { taken: '✅', skipped: '⏭️', snoozed: '⏰' };
            return (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', marginBottom: 6 }}>
                  📊 {t('med_hist_h') || 'Ultimi 14 giorni'}
                  {pct !== null && (
                    <span style={{
                      marginLeft: 6, padding: '2px 8px', borderRadius: 100,
                      background: pct >= 80 ? 'var(--gnB)' : 'rgba(212,163,91,0.18)',
                      color: pct >= 80 ? 'var(--gn)' : '#B36E00',
                    }}>
                      {pct}% {t('med_hist_taken_pct') || 'prese'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 2 }}>{cells}</div>
                <div style={{ fontSize: 9, color: 'var(--km)', marginTop: 6 }}>
                  ✓ {t('med_hist_lg_taken') || 'presa'} · ½ {t('med_hist_lg_partial') || 'in parte'} · ✕ {t('med_hist_lg_skipped') || 'saltata'} · ○ {t('med_hist_lg_none') || 'non registrata'} · &nbsp;·&nbsp; {t('med_hist_lg_pause') || 'non prevista'}
                </div>
                {notedLogs.length > 0 && (
                  <div style={{ marginTop: 8, borderTop: '1px dashed var(--sd)', paddingTop: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--km)', marginBottom: 4 }}>
                      📝 {t('med_hist_notes') || 'Note recenti'}
                    </div>
                    {notedLogs.map((l, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--k)', marginBottom: 3, lineHeight: 1.35 }}>
                        {actIcon[l.action] || '•'} <strong>{fmtDT(l.scheduled_at)}</strong> — {l.note}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
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

function MedicationForm({ member, me, med, onCancel, onSaved, onDirtyChange }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [name, setName] = useState(med?.name || '');
  const [dose, setDose] = useState(med?.dose || '');
  const [notes, setNotes] = useState(med?.notes || '');
  const [times, setTimes] = useState(med?.times_of_day || []);
  // Intervallo giorni: 1 = ogni giorno, 2 = a giorni alterni, N = ogni N giorni.
  // L'intervallo si conta a partire dalla data "Dal" (start_date).
  const [intervalDays, setIntervalDays] = useState(Number(med?.interval_days) || 1);
  // Campo "Ogni N giorni": stato testuale separato (si può svuotare/riscrivere)
  const [customDays, setCustomDays] = useState(
    (Number(med?.interval_days) || 1) > 2 ? String(med.interval_days) : ''
  );
  // Giorni della settimana specifici (0=Dom … 6=Sab) — es. lun e gio
  const [dowDays, setDowDays] = useState(Array.isArray(med?.days_of_week) ? med.days_of_week : []);
  // Ciclo: N giorni di assunzione, M di pausa (es. pillola 21/7)
  const [cycleOn, setCycleOn] = useState(med?.cycle_on_days ?? '');
  const [cycleOff, setCycleOff] = useState(med?.cycle_off_days ?? '');
  // Notifica positiva ai caregiver a ogni "Presa"
  const [notifyTaken, setNotifyTaken] = useState(!!med?.notify_on_taken);
  // Scorte: dosi per confezione e dosi rimanenti (facoltativo).
  // supply_left si decrementa da solo a ogni "✅ Presa" (trigger DB).
  const [supplyTotal, setSupplyTotal] = useState(med?.supply_total ?? '');
  const [supplyLeft, setSupplyLeft] = useState(med?.supply_left ?? '');
  const [newTime, setNewTime] = useState('08:00');
  // true se l'utente ha toccato il time-picker senza premere "+ Aggiungi":
  // in quel caso l'orario viene incluso comunque al salvataggio (bug fix:
  // "imposto l'ora, salvo, ma l'ora non viene salvata").
  const [newTimeTouched, setNewTimeTouched] = useState(false);
  const [startDate, setStartDate] = useState(med?.start_date || toLocalYMD(new Date()));
  const [endDate, setEndDate] = useState(med?.end_date || '');
  // Fasi di frequenza variabile: [{ from: 'YYYY-MM-DD', times: ['08:00'], _newTime: '08:00' }]
  const [phases, setPhases] = useState(() =>
    Array.isArray(med?.schedule_phases)
      ? med.schedule_phases.map((p) => ({ from: p.from || '', times: p.times || [], _newTime: '08:00' }))
      : []
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Dirty tracking: il parent (MedicationsModal) ascolta per chiedere
  // conferma se l'utente preme X senza salvare.
  const initial = {
    name: med?.name || '', dose: med?.dose || '', notes: med?.notes || '',
    times: JSON.stringify(med?.times_of_day || []),
    startDate: med?.start_date || toLocalYMD(new Date()),
    endDate: med?.end_date || '',
    phases: JSON.stringify(Array.isArray(med?.schedule_phases)
      ? med.schedule_phases.map((p) => ({ from: p.from || '', times: p.times || [] }))
      : []),
  };
  useEffect(() => {
    const phasesCmp = JSON.stringify(phases.map((p) => ({ from: p.from || '', times: p.times || [] })));
    const dirty = (
      name.trim() !== initial.name.trim() ||
      dose.trim() !== initial.dose.trim() ||
      notes.trim() !== initial.notes.trim() ||
      JSON.stringify(times) !== initial.times ||
      startDate !== initial.startDate ||
      endDate !== initial.endDate ||
      intervalDays !== (Number(med?.interval_days) || 1) ||
      JSON.stringify(dowDays) !== JSON.stringify(Array.isArray(med?.days_of_week) ? med.days_of_week : []) ||
      String(cycleOn ?? '') !== String(med?.cycle_on_days ?? '') ||
      String(cycleOff ?? '') !== String(med?.cycle_off_days ?? '') ||
      notifyTaken !== !!med?.notify_on_taken ||
      String(supplyTotal ?? '') !== String(med?.supply_total ?? '') ||
      String(supplyLeft ?? '') !== String(med?.supply_left ?? '') ||
      phasesCmp !== initial.phases ||
      // Orario nel picker toccato ma non ancora aggiunto
      (newTimeTouched && !times.includes(newTime))
    );
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, dose, notes, times, startDate, endDate, intervalDays, dowDays, cycleOn, cycleOff, notifyTaken, supplyTotal, supplyLeft, phases, newTime, newTimeTouched]);

  const addTime = () => {
    if (!newTime) return;
    if (times.includes(newTime)) return;
    setTimes([...times, newTime].sort());
  };
  const removeTime = (t) => setTimes(times.filter((x) => x !== t));

  const updatePhase = (idx, patch) => {
    setPhases(phases.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };
  const addPhaseTime = (idx) => {
    const p = phases[idx];
    if (!p._newTime || (p.times || []).includes(p._newTime)) return;
    updatePhase(idx, { times: [...(p.times || []), p._newTime].sort() });
  };
  const removePhaseTime = (idx, time) => {
    updatePhase(idx, { times: (phases[idx].times || []).filter((x) => x !== time) });
  };
  const addPhase = () => setPhases([...phases, { from: '', times: [], _newTime: '08:00' }]);
  const removePhase = (idx) => setPhases(phases.filter((_, i) => i !== idx));

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr(t('med_err_name') || 'Inserisci il nome della medicina.');
      return;
    }
    setBusy(true);
    setErr('');
    // Auto-include: orario scelto nel picker ma mai aggiunto con "+ Aggiungi"
    let finalTimes = times;
    if (newTimeTouched && newTime && !times.includes(newTime)) {
      finalTimes = [...times, newTime].sort();
    }
    const cleanPhases = phases
      .map((p) => {
        // Stesso auto-include per gli orari delle fasi di frequenza
        const ts = [...(p.times || [])];
        if (p._touched && p._newTime && !ts.includes(p._newTime)) ts.push(p._newTime);
        return { from: p.from, times: ts.sort() };
      })
      .filter((p) => p.from && p.times.length > 0)
      .sort((a, b) => a.from.localeCompare(b.from));
    const payload = {
      member_id: member.id,
      name: name.trim(),
      dose: dose.trim() || null,
      notes: notes.trim() || null,
      times_of_day: finalTimes,
      // Con intervallo > 1 serve una data di ancoraggio: se manca, oggi.
      start_date: startDate || ((intervalDays > 1 || (Number(cycleOn) > 0 && Number(cycleOff) > 0)) ? toLocalYMD(new Date()) : null),
      end_date: endDate || null,
      interval_days: Math.max(1, Number(intervalDays) || 1),
      days_of_week: dowDays.length > 0 ? dowDays : null,
      cycle_on_days: (Number(cycleOn) > 0 && Number(cycleOff) > 0) ? Number(cycleOn) : null,
      cycle_off_days: (Number(cycleOn) > 0 && Number(cycleOff) > 0) ? Number(cycleOff) : null,
      notify_on_taken: !!notifyTaken,
      supply_total: supplyTotal === '' || supplyTotal === null ? null : Math.max(1, Number(supplyTotal) || 1),
      supply_left: supplyLeft === '' || supplyLeft === null ? null : Math.max(0, Number(supplyLeft) || 0),
      // Se le scorte sono state ricaricate, l'avviso "sta per finire" si riarma
      ...(supplyLeft !== '' && supplyLeft !== null &&
          Number(supplyLeft) > Number(med?.supply_left ?? -1)
        ? { supply_alert_sent: false } : {}),
      schedule_phases: cleanPhases.length > 0 ? cleanPhases : null,
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
        <input type="time" value={newTime}
          onChange={(e) => { setNewTime(e.target.value); setNewTimeTouched(true); }}
          className="input" style={{ flex: 1, minWidth: 0 }}
          data-testid="med-form-time-picker" />
        <button type="button" onClick={addTime} className="profile-btn"
          style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          data-testid="med-form-add-time">
          + {t('add') || 'Aggiungi'}
        </button>
      </div>
      {/* Hint: l'orario nel picker viene incluso ANCHE senza "+ Aggiungi" */}
      {newTimeTouched && !times.includes(newTime) && (
        <div style={{
          marginTop: 6, padding: '6px 10px', borderRadius: 8,
          background: 'var(--gnB)', border: '1px solid var(--gn)',
          fontSize: 11, color: 'var(--gn)', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }} data-testid="med-form-time-autoinclude-hint">
          <span>✅</span>
          <span>{t('med_time_autoinclude', { time: newTime }) ||
            `L'orario ${newTime} verrà salvato. Premi "+ Aggiungi" se vuoi inserirne altri.`}</span>
        </div>
      )}
      <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
        {t('med_times_hint') || 'Lascia vuoto se la medicina è "al bisogno" (no reminder)'}
      </p>

      {/* Periodo di assunzione */}
      <label style={{ marginTop: 10 }}>📅 {t('med_period_label') || 'Periodo di assunzione'}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 2 }}>{t('med_period_from') || 'Dal'}</div>
          <input type="date" className="input" value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ width: '100%', minWidth: 0 }}
            data-testid="med-form-start-date" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 2 }}>{t('med_period_to') || 'Al'}</div>
          <input type="date" className="input" value={endDate} min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ width: '100%', minWidth: 0 }}
            data-testid="med-form-end-date" />
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
        {t('med_period_hint') || 'Lascia vuoto "Al" se la cura è continuativa.'}
      </p>

      {/* Frequenza in giorni: ogni giorno / giorni alterni / ogni N giorni */}
      <label style={{ marginTop: 10 }}>📆 {t('med_interval_label') || 'Ogni quanti giorni'}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {[
          { v: 1, label: t('med_interval_daily') || 'Ogni giorno' },
          { v: 2, label: t('med_interval_alt') || 'A giorni alterni' },
        ].map((opt) => (
          <button key={opt.v} type="button"
            onClick={() => { setIntervalDays(opt.v); setCustomDays(''); }}
            data-testid={`med-interval-${opt.v}`}
            style={{
              padding: '6px 12px', borderRadius: 100, fontSize: 12, fontWeight: 600,
              border: intervalDays === opt.v ? '1.5px solid var(--ac)' : '1.5px solid var(--sm)',
              background: intervalDays === opt.v ? 'var(--ac)' : 'white',
              color: intervalDays === opt.v ? 'white' : 'var(--k)',
              cursor: 'pointer',
            }}>
            {intervalDays === opt.v ? '✓ ' : ''}{opt.label}
          </button>
        ))}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', borderRadius: 100, fontSize: 12, fontWeight: 600,
          border: intervalDays > 2 ? '1.5px solid var(--ac)' : '1.5px solid var(--sm)',
          background: intervalDays > 2 ? 'rgba(193,98,75,0.10)' : 'var(--w, #fff)',
          color: 'var(--k)',
        }}>
          {t('med_interval_every') || 'Ogni'}
          <input type="number" min="3" max="60" inputMode="numeric"
            value={customDays}
            placeholder="N"
            onChange={(e) => {
              // Stato locale: l'utente deve poter cancellare e riscrivere
              const raw = e.target.value;
              setCustomDays(raw);
              const n = Number(raw);
              if (n >= 3 && n <= 60) setIntervalDays(n);
            }}
            onBlur={() => {
              const n = Number(customDays);
              if (!(n >= 3 && n <= 60)) {
                // Valore non valido → torna a "Ogni giorno" e svuota
                setCustomDays('');
                if (intervalDays > 2) setIntervalDays(1);
              }
            }}
            data-testid="med-interval-custom"
            style={{
              width: 44, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 12, fontWeight: 700, textAlign: 'center', color: 'var(--ac)',
            }} />
          {t('med_interval_days') || 'giorni'}
        </span>
      </div>
      {intervalDays > 1 && (
        <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
          {t('med_interval_hint') ||
            'Il conteggio parte dalla data "Dal": quel giorno la medicina va presa, poi ogni'}
          {' '}{intervalDays}{' '}{t('med_interval_days') || 'giorni'}.
        </p>
      )}

      {/* Giorni della settimana specifici */}
      <label style={{ marginTop: 10 }}>🗓️ {t('med_freq_dow') || 'Giorni della settimana'}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const lbl = new Date(2026, 5, 7 + d).toLocaleDateString(undefined, { weekday: 'short' });
          const on = dowDays.includes(d);
          return (
            <button key={d} type="button"
              onClick={() => setDowDays((prev) => on ? prev.filter((x) => x !== d) : [...prev, d])}
              data-testid={`med-dow-${d}`}
              style={{
                flex: 1, minWidth: 0, padding: '7px 0', borderRadius: 8,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: on ? '1.5px solid var(--ac)' : '1px solid var(--sm)',
                background: on ? 'var(--ac)' : 'var(--w, #fff)',
                color: on ? 'white' : 'var(--k)',
                textTransform: 'capitalize',
              }}>
              {lbl}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
        {dowDays.length > 0
          ? (t('med_freq_dow_on') || 'La medicina va presa solo nei giorni selezionati.')
          : (t('med_freq_dow_off') || 'Nessun giorno selezionato = tutti i giorni.')}
      </p>

      {/* Ciclo: N giorni sì, M di pausa */}
      <label style={{ marginTop: 10 }}>🔁 {t('med_freq_cycle') || 'Ciclo'} <span style={{ fontWeight: 400, color: 'var(--km)' }}>({t('optional') || 'facoltativo'})</span></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 2 }}>
            {t('med_cycle_on') || 'Giorni di assunzione'}
          </div>
          <input type="number" min="1" max="60" inputMode="numeric" className="input"
            value={cycleOn} placeholder="es. 21"
            onChange={(e) => setCycleOn(e.target.value)}
            style={{ width: '100%', minWidth: 0 }}
            data-testid="med-cycle-on" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 2 }}>
            {t('med_cycle_off') || 'Giorni di pausa'}
          </div>
          <input type="number" min="1" max="60" inputMode="numeric" className="input"
            value={cycleOff} placeholder="es. 7"
            onChange={(e) => setCycleOff(e.target.value)}
            style={{ width: '100%', minWidth: 0 }}
            data-testid="med-cycle-off" />
        </div>
      </div>
      {(Number(cycleOn) > 0 || Number(cycleOff) > 0) && (
        <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
          {t('med_cycle_hint') || 'Il ciclo parte dalla data "Dal": es. 21 giorni di assunzione, poi 7 di pausa, e ricomincia.'}
        </p>
      )}

      {/* Notifica positiva: avvisa i caregiver a ogni "Presa" */}
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 12,
        border: notifyTaken ? '1.5px solid var(--gn)' : '1px solid var(--sm)',
        background: 'var(--w, #fff)',
      }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={notifyTaken}
            onChange={(e) => setNotifyTaken(e.target.checked)}
            data-testid="med-notify-taken"
            style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)' }}>
              🔔 {t('med_notify_taken_h') || 'Avvisa quando viene presa'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--km)', lineHeight: 1.4 }}>
              {t('med_notify_taken_p') || 'I caregiver ricevono una notifica a ogni "✅ Presa" registrata.'}
            </div>
          </div>
        </label>
      </div>

      {/* Scorte (facoltativo) */}
      <label style={{ marginTop: 10 }}>📦 {t('med_supply_label') || 'Scorte (facoltativo)'}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 2 }}>
            {t('med_supply_total') || 'Dosi per confezione'}
          </div>
          <input type="number" min="1" max="500" inputMode="numeric" className="input"
            value={supplyTotal}
            placeholder={t('med_supply_ph') || 'es. 30'}
            onChange={(e) => {
              const v = e.target.value;
              setSupplyTotal(v);
              // Prima compilazione: le rimanenti partono dalla confezione piena
              if (v && (supplyLeft === '' || supplyLeft === null)) setSupplyLeft(v);
            }}
            style={{ width: '100%', minWidth: 0 }}
            data-testid="med-form-supply-total" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 2 }}>
            {t('med_supply_left') || 'Dosi rimanenti ora'}
          </div>
          <input type="number" min="0" max="999" inputMode="numeric" className="input"
            value={supplyLeft}
            placeholder="—"
            onChange={(e) => setSupplyLeft(e.target.value)}
            style={{ width: '100%', minWidth: 0 }}
            data-testid="med-form-supply-left" />
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
        {t('med_supply_hint') ||
          'Si aggiorna da solo a ogni "✅ Presa". Quando restano ~7 giorni ti avvisiamo e potrai chiedere la ricetta al medico con un tocco.'}
      </p>

      {/* Cambi di frequenza nel tempo */}
      <label style={{ marginTop: 10 }}>🔁 {t('med_phases_label') || 'Cambi di frequenza'}</label>
      {phases.map((p, idx) => (
        <div key={idx} style={{
          padding: 10, borderRadius: 10, marginBottom: 8,
          background: 'var(--ab)', border: '1px dashed var(--sd)',
        }} data-testid={`med-phase-${idx}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--km)', flexShrink: 0 }}>
              {t('med_phase_from') || 'A partire dal'}
            </span>
            <input type="date" className="input" value={p.from}
              min={startDate || undefined}
              onChange={(e) => updatePhase(idx, { from: e.target.value })}
              style={{ flex: 1, minWidth: 0 }}
              data-testid={`med-phase-from-${idx}`} />
            <button type="button" onClick={() => removePhase(idx)}
              data-testid={`med-phase-remove-${idx}`}
              style={{
                background: 'transparent', border: 'none', color: 'var(--rd)',
                cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0,
              }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {(p.times || []).map((time) => (
              <span key={time} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 100,
                background: 'var(--w, #fff)', border: '1px solid var(--sm)',
                fontSize: 12, fontWeight: 600,
              }}>
                🕒 {time}
                <button type="button" onClick={() => removePhaseTime(idx, time)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--rd)', cursor: 'pointer', padding: 0,
                    fontSize: 14, lineHeight: 1,
                  }}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="time" value={p._newTime || '08:00'}
              onChange={(e) => updatePhase(idx, { _newTime: e.target.value, _touched: true })}
              className="input" style={{ flex: 1, minWidth: 0 }} />
            <button type="button" onClick={() => addPhaseTime(idx)} className="profile-btn"
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              + {t('add') || 'Aggiungi'}
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addPhase} className="profile-btn"
        style={{ width: '100%' }} data-testid="med-form-add-phase">
        🔁 {t('med_phases_add') || '+ Aggiungi cambio di frequenza'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 4 }}>
        {t('med_phases_hint') || 'Es. prima settimana 2 volte al giorno, poi dal giorno X solo 1 volta.'}
      </p>

      <label style={{ marginTop: 10 }}>{t('med_notes_label') || 'Note'}</label>
      <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
        placeholder={t('med_notes_ph') || 'es. dopo i pasti, con un bicchiere d\'acqua'}
        rows={2} data-testid="med-form-notes" />

      {err && (
        <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>
      )}

      {/* Save bar sticky: resta sempre visibile in fondo alla form mentre si
          scrolla. Bug fix utente 13 giu: "non vedo il Salva, premo X e perdo
          tutto". Ora il Salva è sempre a portata di mano. */}
      <div className="row" style={{
        marginTop: 16,
        position: 'sticky', bottom: 0,
        background: 'var(--w, #fff)',
        padding: '12px 0 calc(8px + env(safe-area-inset-bottom, 0px))',
        borderTop: '1px solid var(--sm)',
        marginLeft: -4, marginRight: -4,
        paddingLeft: 4, paddingRight: 4,
        boxShadow: '0 -8px 12px -8px rgba(28,22,17,0.08)',
        zIndex: 5,
      }}>
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
