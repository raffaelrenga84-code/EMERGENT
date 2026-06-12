import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { toLocalYMD } from '../lib/dateUtils.js';
import CareAttachments from './CareAttachments.jsx';
import { getBpReadings, formatBpReadings, isBpHigh } from '../lib/bp.js';

/**
 * DailyDiarySection — diario giornaliero del membro assistito.
 *
 * Per ogni giorno (UNIQUE su member_id + diary_date):
 *   - Mood 1-5 ⭐
 *   - Ore di sonno (number)
 *   - Appetito 1-3 (poco / normale / molto)
 *   - Note libere
 *   - Peso (opzionale)
 *
 * Layout: oggi in alto (sempre editabile) + storico ultimi 14 giorni
 * collassati come riepilogo (mood emoji + nota breve).
 */
export default function DailyDiarySection({ member, me }) {
  const { t } = useT();
  const today = toLocalYMD(new Date());
  const [todayEntry, setTodayEntry] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [mood, setMood] = useState(null);
  const [sleepHours, setSleepHours] = useState('');
  const [appetite, setAppetite] = useState(null);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');

  // Pressione — misurazioni multiple al giorno (salvate subito)
  const nowHM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [newTime, setNewTime] = useState(nowHM());
  const [newSys, setNewSys] = useState('');
  const [newDia, setNewDia] = useState('');
  const [bpSaving, setBpSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const { data } = await supabase
      .from('daily_diary').select('*')
      .eq('member_id', member.id)
      .gte('diary_date', toLocalYMD(since))
      .order('diary_date', { ascending: false });
    const rows = data || [];
    const t0 = rows.find((r) => r.diary_date === today);
    setTodayEntry(t0 || null);
    setMood(t0?.mood ?? null);
    setSleepHours(t0?.sleep_hours != null ? String(t0.sleep_hours) : '');
    setAppetite(t0?.appetite ?? null);
    setWeight(t0?.weight_kg != null ? String(t0.weight_kg) : '');
    setNotes(t0?.notes || '');
    setHistory(rows.filter((r) => r.diary_date !== today));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id]);

  const save = async () => {
    setSaving(true);
    const payload = {
      member_id: member.id,
      diary_date: today,
      mood: mood ?? null,
      sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
      appetite: appetite ?? null,
      weight_kg: weight ? parseFloat(weight) : null,
      notes: notes.trim() || null,
      recorded_by: me?.id || null,
    };
    const { error } = await supabase
      .from('daily_diary').upsert(payload, { onConflict: 'member_id,diary_date' });
    setSaving(false);
    if (error) { alert(error.message); return; }
    await load();
  };

  // Salva l'array di misurazioni (upsert immediato, non tocca gli altri
  // campi del giorno né gli input ancora non salvati).
  const saveReadings = async (next) => {
    setBpSaving(true);
    const { data, error } = await supabase
      .from('daily_diary')
      .upsert({
        member_id: member.id, diary_date: today,
        bp_readings: next, recorded_by: me?.id || null,
      }, { onConflict: 'member_id,diary_date' })
      .select().single();
    setBpSaving(false);
    if (error) { alert(error.message); return false; }
    setTodayEntry(data);
    return true;
  };

  const addReading = async () => {
    const sys = parseInt(newSys, 10);
    const dia = parseInt(newDia, 10);
    if (!sys || !dia) return;
    const next = [...getBpReadings(todayEntry), { t: newTime || null, sys, dia }];
    if (await saveReadings(next)) {
      setNewSys(''); setNewDia(''); setNewTime(nowHM());
    }
  };

  const removeReading = async (idx) => {
    const next = getBpReadings(todayEntry).filter((_, i) => i !== idx);
    await saveReadings(next);
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--km)' }}>
      {t('loading') || 'Caricamento…'}
    </div>;
  }

  const moodEmoji = (v) => {
    if (v === 1) return '😢';
    if (v === 2) return '😕';
    if (v === 3) return '😐';
    if (v === 4) return '🙂';
    if (v === 5) return '😄';
    return '—';
  };
  const appetiteLabel = (v) => {
    if (v === 1) return t('dd_appetite_low') || 'Poco';
    if (v === 2) return t('dd_appetite_med') || 'Normale';
    if (v === 3) return t('dd_appetite_high') || 'Molto';
    return '—';
  };

  return (
    <div data-testid="diary-section">
      {/* Today */}
      <div style={{
        padding: 12, background: 'var(--ab)', borderRadius: 12,
        border: '1px solid var(--sd)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', marginBottom: 10 }}>
          📓 {t('dd_today') || 'Oggi'} — {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>

        {/* Mood selector ⭐ */}
        <Label>{t('dd_mood_label') || 'Umore'}</Label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[1, 2, 3, 4, 5].map((v) => (
            <button key={v} type="button" onClick={() => setMood(v)}
              data-testid={`dd-mood-${v}`}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10,
                background: mood === v ? 'var(--ac)' : 'white',
                color: mood === v ? 'white' : 'var(--k)',
                border: `1.5px solid ${mood === v ? 'var(--ac)' : 'var(--sm)'}`,
                fontSize: 22, cursor: 'pointer',
              }}>{moodEmoji(v)}</button>
          ))}
        </div>

        {/* Sonno + Peso side-by-side */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Label>💤 {t('dd_sleep_label') || 'Sonno (h)'}</Label>
            <input className="input" type="number" step="0.5" min="0" max="24"
              value={sleepHours} onChange={(e) => setSleepHours(e.target.value)}
              data-testid="dd-sleep" placeholder="7.5" />
          </div>
          <div style={{ flex: 1 }}>
            <Label>⚖️ {t('dd_weight_label') || 'Peso (kg)'}</Label>
            <input className="input" type="number" step="0.1" min="0"
              value={weight} onChange={(e) => setWeight(e.target.value)}
              data-testid="dd-weight" placeholder="72.5" />
          </div>
        </div>

        {/* Pressione sanguigna — più misurazioni al giorno */}
        <Label style={{ marginTop: 10 }}>🩺 {t('dd_bp_label') || 'Pressione (mmHg)'}</Label>
        {getBpReadings(todayEntry).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}
            data-testid="dd-bp-list">
            {getBpReadings(todayEntry).map((r, i) => {
              const high = isBpHigh(r);
              return (
                <span key={`${r.t}-${i}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', background: high ? '#FDF0EE' : 'white',
                  border: `1px solid ${high ? '#E8B0A8' : 'var(--sm)'}`, borderRadius: 100,
                  fontSize: 13, fontWeight: 700, color: high ? '#C0392B' : 'var(--k)',
                }}>
                  {r.t && <span style={{ color: high ? '#C0392B' : 'var(--km)', fontWeight: 600, fontSize: 11 }}>🕒 {r.t}</span>}
                  {r.sys}/{r.dia}{high ? ' ⚠️' : ''}
                  <button type="button" onClick={() => removeReading(i)}
                    disabled={bpSaving}
                    data-testid={`dd-bp-remove-${i}`}
                    style={{
                      border: 'none', background: 'var(--ab)', borderRadius: 100,
                      padding: '1px 7px', fontSize: 11, color: 'var(--km)', cursor: 'pointer',
                    }}>✕</button>
                </span>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="time"
            value={newTime} onChange={(e) => setNewTime(e.target.value)}
            data-testid="dd-bp-time"
            style={{ width: 104, flexShrink: 0, padding: '14px 8px' }} />
          <input className="input" type="number" min="40" max="300" inputMode="numeric"
            value={newSys} onChange={(e) => setNewSys(e.target.value)}
            data-testid="dd-bp-sys" placeholder="120" style={{ flex: 1, minWidth: 0 }} />
          <span style={{ fontWeight: 800, color: 'var(--km)' }}>/</span>
          <input className="input" type="number" min="20" max="200" inputMode="numeric"
            value={newDia} onChange={(e) => setNewDia(e.target.value)}
            data-testid="dd-bp-dia" placeholder="80" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" onClick={addReading}
            disabled={bpSaving || !newSys || !newDia}
            aria-label={t('dd_bp_add') || 'Aggiungi misurazione'}
            data-testid="dd-bp-add-btn"
            style={{
              width: 48, height: 48, flexShrink: 0, borderRadius: 13, border: 'none',
              background: (!newSys || !newDia) ? 'var(--kl)' : 'var(--ac)',
              color: 'white', fontSize: 22, fontWeight: 800, cursor: 'pointer',
            }}>{bpSaving ? '…' : '+'}</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 4, marginBottom: 4 }}>
          💡 {t('dd_bp_hint') || 'Puoi registrare più misurazioni al giorno · si salvano subito'}
        </div>

        {/* Appetito */}
        <Label style={{ marginTop: 10 }}>🍽️ {t('dd_appetite_label') || 'Appetito'}</Label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[1, 2, 3].map((v) => (
            <button key={v} type="button" onClick={() => setAppetite(v)}
              data-testid={`dd-appetite-${v}`}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 10,
                background: appetite === v ? 'var(--ac)' : 'white',
                color: appetite === v ? 'white' : 'var(--k)',
                border: `1.5px solid ${appetite === v ? 'var(--ac)' : 'var(--sm)'}`,
                fontWeight: 600, cursor: 'pointer', fontSize: 12,
              }}>{appetiteLabel(v)}</button>
          ))}
        </div>

        {/* Note */}
        <Label>📝 {t('dd_notes_label') || 'Note del giorno'}</Label>
        <textarea className="input" value={notes} rows={3}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('dd_notes_ph') || 'Tutto bene oggi · È stato visitato dal dottore...'}
          data-testid="dd-notes" />

        <button type="button" onClick={save} disabled={saving}
          className="btn full" style={{ marginTop: 12 }}
          data-testid="dd-save-btn">
          {saving ? <span className="spin" /> : `💾 ${t('dd_save_today') || 'Salva oggi'}`}
        </button>

        {/* Allegati per la entry di oggi (visibili solo se la entry è già stata salvata) */}
        {todayEntry?.id ? (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--sm)' }}>
            <CareAttachments
              memberId={member.id}
              kind="diary"
              parentId={todayEntry.id}
              meId={me?.id}
            />
          </div>
        ) : (
          <div style={{
            marginTop: 14, padding: '10px 12px',
            background: 'var(--ab)', borderRadius: 10,
            fontSize: 11, color: 'var(--km)', textAlign: 'center', lineHeight: 1.4,
          }}>
            📎 {t('dd_save_to_attach') || 'Salva il diario di oggi per allegare foto / referti.'}
          </div>
        )}
      </div>

      {/* Storico ultimi 14 giorni */}
      {history.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 8 }}>
            📚 {t('dd_history_h') || 'Ultimi giorni'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((h) => (
              <div key={h.id} style={{
                padding: 10, borderRadius: 10,
                background: 'white', border: '1px solid var(--sm)',
                fontSize: 13,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 20 }}>{moodEmoji(h.mood)}</span>
                  <span style={{ fontWeight: 700, flex: 1 }}>
                    {new Date(h.diary_date + 'T12:00:00').toLocaleDateString(undefined, {
                      weekday: 'short', day: 'numeric', month: 'short',
                    })}
                  </span>
                  {formatBpReadings(h) && (
                    <span style={{ fontSize: 11, color: 'var(--km)' }}>🩺 {formatBpReadings(h)}</span>
                  )}
                  {h.sleep_hours != null && (
                    <span style={{ fontSize: 11, color: 'var(--km)' }}>💤 {h.sleep_hours}h</span>
                  )}
                  {h.appetite != null && (
                    <span style={{ fontSize: 11, color: 'var(--km)' }}>🍽️ {appetiteLabel(h.appetite)}</span>
                  )}
                </div>
                {h.notes && (
                  <div style={{ fontSize: 12, color: 'var(--km)', lineHeight: 1.4 }}>
                    {h.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children, style }) {
  return (
    <label style={{
      display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--km)',
      marginBottom: 4, ...(style || {}),
    }}>
      {children}
    </label>
  );
}
