import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AddEventModal({ familyId, authorMemberId, onClose, onCreated }) {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [recurringDays, setRecurringDays] = useState([]); // 0=Lun, ..., 6=Dom
  const [recurringUntil, setRecurringUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggleDay = (idx) => {
    setRecurringDays((prev) => prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx].sort((a,b) => a-b));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setBusy(true); setErr('');

    const startsAt = time
      ? new Date(`${date}T${time}:00`).toISOString()
      : new Date(`${date}T09:00:00`).toISOString();

    const { error } = await supabase.from('events').insert({
      family_id: familyId,
      title: title.trim(),
      starts_at: startsAt,
      location: location.trim() || null,
      description: description.trim() || null,
      created_by: authorMemberId || null,
      recurring_days: recurringDays.length > 0 ? recurringDays : null,
      recurring_until: recurringDays.length > 0 && recurringUntil ? recurringUntil : null,
    });

    if (error) { setErr(error.message); setBusy(false); }
    else onCreated && onCreated();
  };

  const isQuickActive = (offset) => date === dateOffset(offset);
  const weekdays = t('weekday_short'); // ['L','M','M','G','V','S','D']
  const fullWeekdays = t('weekday_full');

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('addevent_h')}</h2>
        <p className="modal-sub">{t('addevent_sub')}</p>

        <form onSubmit={submit}>
          <label htmlFor="title">{t('addtask_title_label')}</label>
          <input id="title" className="input" autoFocus
            placeholder={t('addevent_title_ph')}
            value={title} onChange={(e) => setTitle(e.target.value)} />

          <div style={{ marginTop: 16 }}>
            <label>{t('addevent_date')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              <button type="button" onClick={() => setDate(dateOffset(0))} style={chipStyle(isQuickActive(0))}>
                📍 {t('date_today')}
              </button>
              <button type="button" onClick={() => setDate(dateOffset(1))} style={chipStyle(isQuickActive(1))}>
                ☀️ {t('date_tomorrow')}
              </button>
              <button type="button" onClick={() => setDate(dateOffset(7))} style={chipStyle(isQuickActive(7))}>
                📅 {t('date_in_a_week')}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="date" type="date" className="input" style={{ flex: 1 }}
                value={date} onChange={(e) => setDate(e.target.value)} required />
              <input id="time" type="time" className="input" style={{ flex: 1 }}
                value={time} onChange={(e) => setTime(e.target.value)}
                placeholder={t('addevent_time')} />
            </div>
          </div>

          {/* Ricorrenza settimanale */}
          <div style={{ marginTop: 20, padding: 14, background: 'var(--ab)', borderRadius: 14, border: '1px solid var(--sm)' }}>
            <label style={{ marginBottom: 4 }}>{t('repeat_label')}</label>
            <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 8 }}>
              {t('repeat_hint')}
            </div>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
              {Array.isArray(weekdays) && weekdays.map((w, idx) => {
                const selected = recurringDays.includes(idx);
                return (
                  <button key={idx} type="button" onClick={() => toggleDay(idx)}
                    title={Array.isArray(fullWeekdays) ? fullWeekdays[idx] : ''}
                    style={{
                      width: 36, height: 36, borderRadius: 50, border: '1.5px solid',
                      borderColor: selected ? 'var(--k)' : 'var(--sm)',
                      background: selected ? 'var(--k)' : 'white',
                      color: selected ? 'white' : 'var(--k)',
                      fontSize: 12, fontWeight: 700,
                    }}>{w}</button>
                );
              })}
            </div>
            {recurringDays.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <label htmlFor="until" style={{ fontSize: 11, color: 'var(--km)' }}>{t('repeat_until')} ({t('addtask_when').toLowerCase()})</label>
                <input id="until" type="date" className="input" style={{ marginTop: 4 }}
                  value={recurringUntil} onChange={(e) => setRecurringUntil(e.target.value)} />
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="loc">{t('addevent_loc')}</label>
            <input id="loc" className="input" placeholder={t('addevent_loc_ph')}
              value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="desc">{t('addevent_desc')}</label>
            <textarea id="desc" className="input" rows={2}
              placeholder={t('addevent_desc_ph')}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}

          <div className="row" style={{ marginTop: 20 }}>
            <button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn" disabled={busy || !title.trim() || !date}>
              {busy ? <span className="spin" /> : t('add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function chipStyle(active) {
  return {
    padding: '6px 12px', borderRadius: 100, border: '1.5px solid',
    borderColor: active ? 'var(--k)' : 'var(--sm)',
    background: active ? 'var(--sm)' : 'white',
    fontSize: 12, fontWeight: 600,
  };
}
