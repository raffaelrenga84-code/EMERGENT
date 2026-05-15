import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import AddEventModal from '../../components/AddEventModal.jsx';
import TaskDetailModal from '../../components/TaskDetailModal.jsx';
import CalendarShareModal from '../../components/CalendarShareModal.jsx';
import ExportAllCalendarsModal from '../../components/ExportAllCalendarsModal.jsx';

const TASK_CAT_EMOJI = { care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌' };

// Espande gli eventi: per quelli ricorrenti, genera istanze nei giorni
// pertinenti tra (start originale) e (recurring_until o +12 mesi).
function expandEvents(events) {
  const expanded = [];
  const horizonEnd = new Date();
  horizonEnd.setMonth(horizonEnd.getMonth() + 12);

  for (const ev of events) {
    if (!ev.recurring_days || ev.recurring_days.length === 0) {
      expanded.push(ev);
      continue;
    }
    const start = new Date(ev.starts_at);
    const until = ev.recurring_until ? new Date(ev.recurring_until) : horizonEnd;
    expanded.push(ev);

    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= until) {
      const wd = (cursor.getDay() + 6) % 7;
      if (ev.recurring_days.includes(wd)) {
        const occ = new Date(cursor);
        occ.setHours(start.getHours(), start.getMinutes(), start.getSeconds());
        expanded.push({
          ...ev,
          id: `${ev.id}__${occ.toISOString().slice(0, 10)}`,
          _origId: ev.id,
          starts_at: occ.toISOString(),
          _isRecurringInstance: true,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return expanded;
}

// Espande i task ricorrenti: per ogni task con due_date e recurring_days,
// genera istanze nei giorni pertinenti tra (due_date) e (recurring_until o +12 mesi).
// recurring_days[] contiene:
//   - valori 0..6 = giorni della settimana (0=Lun, 6=Dom)
//   - valori >6  = giorni specifici del mese (es. 10 = il 10 di ogni mese)
function expandTasks(tasks) {
  const expanded = [];
  // Per i task limita l'orizzonte a 6 mesi (evita liste infinite di ricorrenze)
  const horizonEnd = new Date();
  horizonEnd.setMonth(horizonEnd.getMonth() + 6);

  for (const tk of tasks) {
    if (!tk.due_date) continue;
    if (!tk.recurring_days || tk.recurring_days.length === 0) {
      expanded.push(tk);
      continue;
    }

    const start = new Date(tk.due_date + 'T00:00:00');
    const until = tk.recurring_until ? new Date(tk.recurring_until + 'T23:59:59') : horizonEnd;
    expanded.push(tk);

    const weekdays = tk.recurring_days.filter((v) => v <= 6);
    // I giorni del mese sono salvati come (giorno + 6) per distinguerli dai weekdays.
    // Es. il giorno 10 è memorizzato come 16. Decodifichiamo per il confronto con dom.
    const monthDays = tk.recurring_days.filter((v) => v > 6).map((v) => v - 6);

    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= until) {
      const wd = (cursor.getDay() + 6) % 7; // 0=Lun..6=Dom
      const dom = cursor.getDate();
      const matches = weekdays.includes(wd) || monthDays.includes(dom);
      if (matches) {
        const occDate = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
        expanded.push({
          ...tk,
          id: `${tk.id}__${occDate}`,
          _origId: tk.id,
          due_date: occDate,
          _isRecurringInstance: true,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return expanded;
}


export default function AgendaTab({ familyId, families, events, tasks = [], members, me, isAll, onChanged, onSwitchFamily }) {
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [selTask, setSelTask] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showExportAll, setShowExportAll] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [openSections, setOpenSections] = useState({ today: true, future: true, past: false });

  const expandedEvents = expandEvents(events);
  // Task con due_date che non sono done, da mostrare in calendario/agenda.
  // Espandi le ricorrenze (settimanali + giorni del mese).
  const baseDueTasks = (tasks || []).filter((tk) => tk.due_date && tk.status !== 'done');
  const dueTasks = expandTasks(baseDueTasks);

  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const today = new Date();
  const referenceDay = selectedDay || new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfToday = new Date(referenceDay.getFullYear(), referenceDay.getMonth(), referenceDay.getDate());
  const endOfToday = new Date(referenceDay.getFullYear(), referenceDay.getMonth(), referenceDay.getDate() + 1);

  // Eventi suddivisi per data
  const todayEvents = expandedEvents.filter((e) => {
    const d = new Date(e.starts_at);
    return d >= startOfToday && d < endOfToday;
  });
  const futureEvents = expandedEvents.filter((e) => new Date(e.starts_at) >= endOfToday);
  const pastEvents = expandedEvents.filter((e) => new Date(e.starts_at) < startOfToday);

  // Task suddivisi per data
  const taskDate = (tk) => new Date(tk.due_date + 'T09:00:00');
  const todayTasks = dueTasks.filter((tk) => {
    const d = taskDate(tk);
    return d >= startOfToday && d < endOfToday;
  });
  const futureTasks = dueTasks.filter((tk) => taskDate(tk) >= endOfToday);
  const pastTasks = dueTasks.filter((tk) => taskDate(tk) < startOfToday);

  // Conteggi totali (eventi + task)
  const todayCount = todayEvents.length + todayTasks.length;
  const futureCount = futureEvents.length + futureTasks.length;
  const pastCount = pastEvents.length + pastTasks.length;

  const removeEvent = async (event) => {
    if (!confirm(t('agenda_delete_confirm'))) return;
    const idToDelete = event._origId || event.id;
    await supabase.from('events').delete().eq('id', idToDelete);
    onChanged();
  };

  const targetFamilyId = familyId || families?.[0]?.id;
  const targetFamily = families?.find((f) => f.id === targetFamilyId);
  const getFamily = (item) => families?.find((f) => f.id === item.family_id);
  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  // Mescola eventi e task ordinati per data
  const renderItems = (evts, tks, past) => {
    const items = [
      ...evts.map((e) => ({ kind: 'event', date: new Date(e.starts_at), data: e })),
      ...tks.map((tk) => ({ kind: 'task', date: taskDate(tk), data: tk })),
    ].sort((a, b) => a.date - b.date);

    return items.slice(0, 80).map((it) => it.kind === 'event' ? (
      <EventCard key={`e-${it.data.id}`} event={it.data} me={me} family={isAll ? getFamily(it.data) : null} past={past} onRemove={() => removeEvent(it.data)} />
    ) : (
      <TaskAsEventCard key={`t-${it.data.id}`} task={it.data} family={isAll ? getFamily(it.data) : null} past={past} onClick={() => {
        // Se è un'istanza ricorrente, apri il task originale dal DB
        const origId = it.data._origId || it.data.id;
        const orig = baseDueTasks.find((tk) => tk.id === origId) || it.data;
        setSelTask(orig);
      }} />
    ));
  };

  return (
    <>
      {/* Family chip switcher inline cliccabile. Include 'Tutte' quando >1 famiglia. */}
      {families && families.length > 1 && (
        <div style={{ padding: '8px 16px 4px', display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--km)', alignSelf: 'center',
            textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4,
          }}>📅</span>
          <button
            type="button"
            onClick={() => onSwitchFamily && onSwitchFamily('all')}
            style={{
              padding: '4px 10px', borderRadius: 100, border: 'none',
              background: isAll ? 'var(--k)' : 'var(--ab)',
              color: isAll ? 'white' : 'var(--km)',
              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
            }}>
            {t('all_families_chip')}
          </button>
          {families.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSwitchFamily && onSwitchFamily(f.id)}
              style={{
                padding: '4px 10px', borderRadius: 100, border: 'none',
                background: (!isAll && targetFamilyId === f.id) ? 'var(--k)' : 'var(--ab)',
                color: (!isAll && targetFamilyId === f.id) ? 'white' : 'var(--km)',
                fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
              }}>
              {f.emoji} {f.name}
            </button>
          ))}
        </div>
      )}

      <MonthGrid
        month={viewMonth}
        events={expandedEvents}
        tasks={dueTasks}
        selectedDay={selectedDay}
        onSelectDay={(d) => setSelectedDay(selectedDay && sameDay(selectedDay, d) ? null : d)}
        onPrev={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
        onNext={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
      />

      {targetFamily && (
        <div style={{ padding: '4px 16px 12px', display: 'flex', gap: 8, flexDirection: 'column' }}>
          {/* Export singola famiglia visibile sempre se c'è solo 1 famiglia, anche in Tutte */}
          {(!isAll || families.length === 1) && (
            <button className="btn full secondary" onClick={() => setShowCalendar(true)}>
              {t('family_export_calendar')}
            </button>
          )}
          {families.length > 1 && (
            <button className="btn full secondary" onClick={() => setShowExportAll(true)}>
              🎨 Esporta tutti i calendari
            </button>
          )}
        </div>
      )}

      {(expandedEvents.length === 0 && dueTasks.length === 0) ? (
        <div className="empty">
          <div className="empty-emoji">📅</div>
          <h3>{t('agenda_empty_h')}</h3>
          <p>{t('agenda_empty_p')}</p>
        </div>
      ) : (
        <>
          <CollapsibleSection
            label={t('agenda_today')}
            count={todayCount}
            open={openSections.today}
            onToggle={() => toggle('today')}
            accent="var(--am)"
          >
            {todayCount > 0 ? renderItems(todayEvents, todayTasks, false) : <p style={{ padding: '0 22px 12px', color: 'var(--km)', fontSize: 13 }}>—</p>}
          </CollapsibleSection>

          <CollapsibleSection
            label={t('agenda_future')}
            count={futureCount}
            open={openSections.future}
            onToggle={() => toggle('future')}
          >
            {futureCount > 0 ? renderItems(futureEvents, futureTasks, false) : <p style={{ padding: '0 22px 12px', color: 'var(--km)', fontSize: 13 }}>—</p>}
          </CollapsibleSection>

          {pastCount > 0 && (
            <CollapsibleSection
              label={t('agenda_past')}
              count={pastCount}
              open={openSections.past}
              onToggle={() => toggle('past')}
            >
              {renderItems(pastEvents, pastTasks, true)}
            </CollapsibleSection>
          )}
        </>
      )}

      <button className="fab" onClick={() => setShowAdd(true)}>+</button>

      {showAdd && (
        <AddEventModal
          familyId={targetFamilyId}
          authorMemberId={me?.id}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onChanged(); }}
        />
      )}

      {selTask && (
        <TaskDetailModal
          task={selTask}
          members={members}
          me={me}
          onClose={() => setSelTask(null)}
          onChanged={() => { onChanged(); }}
          onClosed={() => setSelTask(null)}
        />
      )}

      {showCalendar && targetFamily && (
        <CalendarShareModal
          family={targetFamily}
          onClose={() => setShowCalendar(false)}
          onChanged={onChanged}
        />
      )}

      {showExportAll && families.length > 1 && (
        <ExportAllCalendarsModal
          families={families}
          onClose={() => setShowExportAll(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function MonthGrid({ month, events, tasks = [], selectedDay, onSelectDay, onPrev, onNext }) {
  const { t } = useT();
  const weekdays = t('weekday_short');
  const months = t('months');

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (d) => d && today.getFullYear() === year && today.getMonth() === m && today.getDate() === d;

  // Eventi e task per giorno
  const itemsByDay = {};
  events.forEach((e) => {
    const d = new Date(e.starts_at);
    if (d.getFullYear() === year && d.getMonth() === m) {
      const day = d.getDate();
      if (!itemsByDay[day]) itemsByDay[day] = { events: 0, tasks: 0 };
      itemsByDay[day].events += 1;
    }
  });
  tasks.forEach((tk) => {
    if (!tk.due_date) return;
    const d = new Date(tk.due_date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() === m) {
      const day = d.getDate();
      if (!itemsByDay[day]) itemsByDay[day] = { events: 0, tasks: 0 };
      itemsByDay[day].tasks += 1;
    }
  });

  return (
    <div className="month-grid-wrap">
      <div className="month-header">
        <button className="month-nav" onClick={onPrev} style={{ fontSize: 18 }}>‹</button>
        <span className="month-title" style={{ fontSize: 16, fontWeight: 700 }}>{Array.isArray(months) ? months[m] : ''} {year}</span>
        <button className="month-nav" onClick={onNext} style={{ fontSize: 18 }}>›</button>
      </div>
      <div className="month-weekdays">
        {Array.isArray(weekdays) && weekdays.map((w, i) => <div key={i} className="month-weekday" style={{ fontSize: 11, fontWeight: 700, padding: '6px 4px' }}>{w}</div>)}
      </div>
      <div className="month-cells" style={{ gap: 4 }}>
        {cells.map((d, i) => {
          const dayItems = d ? itemsByDay[d] : null;
          const eventCount = dayItems?.events || 0;
          const taskCount = dayItems?.tasks || 0;
          const totalCount = eventCount + taskCount;
          const hasItems = totalCount > 0;
          const isSelected = d && selectedDay && selectedDay.getFullYear() === year && selectedDay.getMonth() === m && selectedDay.getDate() === d;
          const today_b = isToday(d);
          // Giorni passati: prima della data di oggi → grigi/sbiaditi
          const cellDate = d ? new Date(year, m, d) : null;
          const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const isPast = cellDate && cellDate < todayMidnight;
          return (
            <button key={i} className={`month-cell ${today_b ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasItems ? 'has-events' : ''}`}
              disabled={!d}
              onClick={() => d && onSelectDay(new Date(year, m, d))}
              style={{
                padding: '6px 4px',
                minHeight: 44,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: hasItems ? 'var(--am)11' : isPast ? '#F5F2EC' : 'white',
                border: today_b ? '2px solid var(--am)' : isSelected ? '2px solid var(--ac)' : hasItems ? '2px solid var(--am)33' : '1px solid var(--sm)',
                borderRadius: 8,
                cursor: d ? 'pointer' : 'default',
                opacity: isPast && !hasItems ? 0.45 : 1,
                transition: 'all 0.2s ease',
              }}>
              {d && <span className="month-day" style={{ fontSize: 14, fontWeight: 700, color: isPast ? 'var(--km)' : 'var(--k)' }}>{d}</span>}
              {hasItems && (
                <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap', width: '100%' }}>
                  {/* Pallini blu per eventi, arancio per task */}
                  {Array.from({ length: Math.min(eventCount, 3) }).map((_, idx) => (
                    <span key={`e${idx}`} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ac)' }} />
                  ))}
                  {Array.from({ length: Math.min(taskCount, 3) }).map((_, idx) => (
                    <span key={`t${idx}`} style={{ width: 6, height: 6, borderRadius: '50%', background: '#F39C12' }} />
                  ))}
                  {totalCount > 6 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac)' }}>+</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {selectedDay && (
        <div style={{
          background: 'var(--am)',
          border: '1.5px solid var(--am)',
          borderRadius: 12,
          padding: '12px 16px',
          margin: '12px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 14,
          fontWeight: 600,
          color: '#7A5A00',
        }}>
          <span>📌 {selectedDay.getDate()} {Array.isArray(t('months')) ? t('months')[selectedDay.getMonth()] : ''} selezionato</span>
          <button onClick={() => onSelectDay(selectedDay)} style={{
            background: 'none',
            border: 'none',
            fontSize: 18,
            cursor: 'pointer',
            padding: 0,
            color: 'inherit',
          }}>✕</button>
        </div>
      )}
      {/* Legenda mini */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, fontSize: 11, color: 'var(--km)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ac)' }} /> Eventi
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F39C12' }} /> Incarichi
        </span>
      </div>
    </div>
  );
}

function CollapsibleSection({ label, count, open, onToggle, children, accent }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={onToggle} className="collapsible-header" style={accent ? { borderLeft: `3px solid ${accent}` } : {}}>
        <span className="collapsible-arrow" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
        <span className="collapsible-label">{label}</span>
        <span className="collapsible-count">{count}</span>
      </button>
      {open && <div className="list">{children}</div>}
    </div>
  );
}

function EventCard({ event, me, family, past, onRemove }) {
  const start = new Date(event.starts_at);
  const canDelete = !event.created_by || event.created_by === me?.id;
  return (
    <div className="card" style={{ opacity: past ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="event-date">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
            {start.toLocaleDateString(undefined, { month: 'short' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--k)' }}>
            {start.getDate()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--km)' }}>
            {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            {event.title}
            {event._isRecurringInstance && <span style={{ fontSize: 12 }} title="Ricorrente">🔁</span>}
            {event.recurring_days && !event._isRecurringInstance && <span style={{ fontSize: 12 }} title="Ricorrente">🔁</span>}
          </div>
          {family && (
            <div style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 100,
              background: family.color ? family.color + '22' : 'var(--sm)',
              color: family.color || 'var(--km)',
              fontSize: 11, fontWeight: 600, marginTop: 4,
            }}>
              {family.emoji} {family.name}
            </div>
          )}
          {event.location && <div style={{ color: 'var(--km)', fontSize: 13, marginTop: 4 }}>📍 {event.location}</div>}
          {event.description && <div style={{ color: 'var(--km)', fontSize: 13, marginTop: 4 }}>{event.description}</div>}
        </div>
        {canDelete && (
          <button onClick={onRemove}
            style={{ background: 'none', border: 'none', color: 'var(--km)', fontSize: 16, padding: 4 }}
            title="Elimina (solo creatore)">✕</button>
        )}
      </div>
    </div>
  );
}

// Card per task con due_date mostrato in agenda
function TaskAsEventCard({ task, family, past, onClick }) {
  const due = new Date(task.due_date + 'T00:00:00');
  const priority = task.priority || (task.urgent ? 'high' : 'normal');
  const accentColor = priority === 'high' ? 'var(--rd)' : '#F39C12';
  return (
    <div className="card" onClick={onClick} style={{
      opacity: past ? 0.6 : 1, cursor: 'pointer',
      borderLeft: `4px solid ${accentColor}`,
      background: priority === 'high' ? 'var(--rd)11' : '#F39C1211',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div className="event-date">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
            {due.toLocaleDateString(undefined, { month: 'short' })}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--k)' }}>{due.getDate()}</div>
          <div style={{ fontSize: 11, color: '#F39C12', fontWeight: 700 }}>📋</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            {priority === 'high' && <span>🚨</span>}
            <span>{TASK_CAT_EMOJI[task.category] || '📌'}</span>
            <span>{task.title}</span>
            {(task._isRecurringInstance || (task.recurring_days && task.recurring_days.length > 0)) && (
              <span style={{ fontSize: 12 }} title="Ricorrente">🔁</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 100,
              background: '#F39C1222', color: '#B36E00',
              fontSize: 11, fontWeight: 600,
            }}>Incarico</span>
            {family && (
              <span style={{
                padding: '2px 8px', borderRadius: 100,
                background: family.color ? family.color + '22' : 'var(--sm)',
                color: family.color || 'var(--km)',
                fontSize: 11, fontWeight: 600,
              }}>
                {family.emoji} {family.name}
              </span>
            )}
            {task.note && <span style={{ fontSize: 12, color: 'var(--km)' }}>{task.note}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
