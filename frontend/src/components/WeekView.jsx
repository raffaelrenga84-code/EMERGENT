import { useMemo, useState, useRef } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * WeekView — vista settimanale stile "to-do della settimana".
 *
 * Mostra una colonna per ogni giorno (lun-dom) con i titoli di
 * eventi/task/assenze. Pensata per dare un colpo d'occhio sulla
 * settimana corrente. Su mobile diventa una lista verticale di 7
 * sezioni, su desktop una griglia 7 colonne.
 *
 * Props:
 *   weekStart: Date (deve cadere di Lunedì)
 *   events, tasks, absences, members: dati già filtrati
 *   familyId: id famiglia (per filtrare assenze) o null per "Tutte"
 *   onPrev, onNext: navigazione tra settimane
 *   onClickEvent(eventId), onClickTask(taskId): apre i dettagli
 *   selectedDay: Date selezionato (highlight)
 *   onSelectDay(Date): tap su un giorno
 */
export default function WeekView({
  weekStart, events = [], tasks = [], absences = [], members = [],
  familyId = null,
  onPrev, onNext, onClickEvent, onClickTask,
  selectedDay, onSelectDay,
}) {
  const { t, lang } = useT();
  const localeMap = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', de: 'de-DE' };
  const dateLocale = localeMap[lang] || 'it-IT';

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

  const today = new Date();
  const isToday = (d) => d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  const isSel = (d) => selectedDay && d.getFullYear() === selectedDay.getFullYear()
    && d.getMonth() === selectedDay.getMonth() && d.getDate() === selectedDay.getDate();

  // Filtra assenze rilevanti
  const relevantAbsences = (absences || []).filter((a) => {
    if (!familyId) return true;
    return Array.isArray(a.visible_to_families) && a.visible_to_families.includes(familyId);
  });

  // Indicizza eventi e task per giorno (YYYY-MM-DD)
  const eventsByDay = {};
  const tasksByDay = {};
  const absencesByDay = {};
  for (const ev of events) {
    if (!ev.starts_at) continue;
    const d = new Date(ev.starts_at);
    const key = ymd(d);
    (eventsByDay[key] = eventsByDay[key] || []).push(ev);
  }
  for (const tk of tasks) {
    if (!tk.due_date) continue;
    const key = String(tk.due_date).slice(0, 10);
    (tasksByDay[key] = tasksByDay[key] || []).push(tk);
  }
  for (const day of days) {
    const iso = ymd(day);
    absencesByDay[iso] = relevantAbsences.filter((a) =>
      a.start_date <= iso && a.end_date >= iso
    );
  }

  const weekLabel = formatWeekLabel(days, dateLocale, t);

  // Swipe orizzontale
  const touchStart = useRef({ x: 0, y: 0, active: false });
  const onTouchStart = (e) => {
    const tc = e.touches?.[0] || e;
    touchStart.current = { x: tc.clientX, y: tc.clientY, active: true };
  };
  const onTouchEnd = (e) => {
    if (!touchStart.current.active) return;
    const tc = e.changedTouches?.[0] || e;
    const dx = tc.clientX - touchStart.current.x;
    const dy = tc.clientY - touchStart.current.y;
    touchStart.current.active = false;
    if (Math.abs(dy) > 40) return;
    if (Math.abs(dx) < 60) return;
    if (dx > 0) onPrev?.();
    else onNext?.();
  };

  const weekdays = t('weekday_short');

  return (
    <div data-testid="week-view" style={{ padding: '0 16px' }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Header con prev/next e label settimana */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, padding: '4px 0',
      }}>
        <button type="button" onClick={onPrev}
          data-testid="week-prev"
          style={navBtnStyle}>‹</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)' }}>
          {weekLabel}
        </div>
        <button type="button" onClick={onNext}
          data-testid="week-next"
          style={navBtnStyle}>›</button>
      </div>

      {/* Lista 7 giorni — vertical stack su mobile, scroll naturale */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map((d, i) => {
          const iso = ymd(d);
          const dayEvents = eventsByDay[iso] || [];
          const dayTasks = tasksByDay[iso] || [];
          const dayAbsences = absencesByDay[iso] || [];
          const total = dayEvents.length + dayTasks.length + dayAbsences.length;
          const t_ = isToday(d);
          const s_ = isSel(d);
          return (
            <button
              type="button"
              key={iso}
              onClick={() => onSelectDay?.(s_ ? null : d)}
              data-testid={`week-day-${iso}`}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 12px', borderRadius: 12,
                background: s_ ? 'var(--ac)' : (t_ ? 'var(--ab)' : 'white'),
                border: `1.5px solid ${s_ ? 'var(--ac)' : (t_ ? 'var(--ac)' : 'var(--sm)')}`,
                color: s_ ? 'white' : 'var(--k)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 150ms ease',
              }}>
              {/* Colonna giorno + numero */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                flexShrink: 0, minWidth: 44,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, opacity: s_ ? 0.85 : 0.6,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {weekdays[i]}
                </div>
                <div style={{
                  fontSize: 22, fontWeight: 800, lineHeight: 1,
                  marginTop: 2,
                }}>
                  {d.getDate()}
                </div>
                {t_ && !s_ && (
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'var(--ac)', marginTop: 4,
                  }} />
                )}
              </div>

              {/* Items: lista compatta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {total === 0 ? (
                  <div style={{
                    fontSize: 12, opacity: s_ ? 0.7 : 0.5, fontStyle: 'italic',
                    paddingTop: 6,
                  }}>
                    {t('weekview_empty') || 'Nulla in agenda'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <ItemPill key={`e-${ev.id}`}
                        emoji="📅" label={ev.title} time={fmtTime(ev.starts_at)}
                        invertColors={s_}
                        onClick={(e) => { e.stopPropagation(); onClickEvent?.(ev._origId || ev.id); }}
                        testid={`week-event-${ev.id}`}
                      />
                    ))}
                    {dayTasks.slice(0, 3).map((tk) => (
                      <ItemPill key={`t-${tk.id}`}
                        emoji={tk.urgent ? '🔴' : '📌'} label={tk.title}
                        invertColors={s_}
                        onClick={(e) => { e.stopPropagation(); onClickTask?.(tk._origId || tk.id); }}
                        testid={`week-task-${tk.id}`}
                      />
                    ))}
                    {dayAbsences.slice(0, 2).map((a, idx) => (
                      <ItemPill key={`a-${a.id}-${idx}`}
                        emoji="✈️" label={`${a.member_name || ''} ${a.reason ? '· ' + a.reason : ''}`.trim()}
                        invertColors={s_}
                        testid={`week-absence-${a.id}`}
                      />
                    ))}
                    {total > 7 && (
                      <div style={{ fontSize: 11, opacity: 0.6, fontStyle: 'italic' }}>
                        + {total - 7} {t('weekview_more') || 'altri'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {total > 0 && (
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '3px 8px', borderRadius: 100,
                  background: s_ ? 'rgba(255,255,255,0.25)' : 'var(--ab)',
                  color: s_ ? 'white' : 'var(--km)',
                  flexShrink: 0, alignSelf: 'flex-start', marginTop: 2,
                }}>{total}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const navBtnStyle = {
  width: 36, height: 36, borderRadius: '50%',
  border: '1px solid var(--sm)', background: 'white',
  color: 'var(--km)', fontSize: 20, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex',
  alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

function ItemPill({ emoji, label, time, invertColors, onClick, testid }) {
  return (
    <div onClick={onClick} data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 0', fontSize: 12, lineHeight: 1.35,
        cursor: onClick ? 'pointer' : 'default',
        opacity: 0.92,
      }}>
      <span style={{ flexShrink: 0, fontSize: 12 }}>{emoji}</span>
      {time && (
        <span style={{ fontSize: 10, opacity: invertColors ? 0.85 : 0.55, fontWeight: 700, flexShrink: 0 }}>
          {time}
        </span>
      )}
      <span style={{
        flex: 1, minWidth: 0, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
        fontWeight: 600,
      }}>{label}</span>
    </div>
  );
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function formatWeekLabel(days, locale, t) {
  const first = days[0];
  const last = days[6];
  const sameMonth = first.getMonth() === last.getMonth();
  const dayFmt = { day: 'numeric' };
  const dayMonthFmt = { day: 'numeric', month: 'short' };
  if (sameMonth) {
    return `${first.toLocaleDateString(locale, dayFmt)}–${last.toLocaleDateString(locale, dayMonthFmt)} ${first.getFullYear()}`;
  }
  return `${first.toLocaleDateString(locale, dayMonthFmt)} – ${last.toLocaleDateString(locale, dayMonthFmt)}`;
}
