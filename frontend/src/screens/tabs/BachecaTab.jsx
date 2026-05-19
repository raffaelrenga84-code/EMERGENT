import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import BirthdayReminder from '../../components/BirthdayReminder.jsx';
import AddTaskModal from '../../components/AddTaskModal.jsx';
import TaskDetailModal from '../../components/TaskDetailModal.jsx';
import WeeklySummaryCard from '../../components/WeeklySummaryCard.jsx';
import OnboardingChecklist from '../../components/OnboardingChecklist.jsx';
import SwipeableRow from '../../components/SwipeableRow.jsx';

const CAT = { care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌' };

export default function BachecaTab({ familyId, families, tasks, members, taskAssignees = [], me, session, isAll, onChanged, onOpenExpenseForTask }) {
  const allMembers = members;
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [selTask, setSelTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [openSections, setOpenSections] = useState({ mine: true, all: true, done: false });
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(null);
  // Filtro rapido in cima alla bacheca: all | mine | todo | urgent
  const [quickFilter, setQuickFilter] = useState('all');
  const family = families?.find((f) => f.id === familyId);

  const ST_LABEL = {
    todo: t('section_todo'), taken: 'In carico', done: 'Fatto', to_pay: 'Da pagare',
  };

  const assigneesForTask = (taskId) => {
    const memberIds = taskAssignees.filter((a) => a.task_id === taskId).map((a) => a.member_id);
    if (memberIds.length === 0) {
      const t = tasks.find((x) => x.id === taskId);
      if (t?.assigned_to) {
        const m = members.find((x) => x.id === t.assigned_to);
        return m ? [m] : [];
      }
      return [];
    }
    return memberIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);
  };

  // Un task è in "Solo le mie da fare" quando:
  //  - delegated_to === me → qualcuno mi ha chiesto "Lo fai tu?"
  //  - sono l'UNICO assegnatario → ho cliccato "Me ne occupo io"
  // L'assegnazione di gruppo (più persone) resta in "Tutte".
  // Lo status non è rilevante: anche un task 'todo' su cui sono unico
  // responsabile è "mio". Il flag 'taken' è un dettaglio di workflow,
  // non un criterio di visibilità.
  const isMine = (task) => {
    if (!me) return false;
    if (task.delegated_to && task.delegated_to === me.id) return true;
    const list = assigneesForTask(task.id);
    return list.length === 1 && list[0].id === me.id;
  };

  const todos = tasks.filter((task) => task.status !== 'done');
  const dones = tasks.filter((task) => task.status === 'done');
  const myTasks = todos.filter(isMine);
  const otherTasks = todos.filter((t) => !isMine(t));

  // Quick filter applicato ai conteggi della sezione "Fatti"
  const applyQuickFilter = (list) => {
    if (quickFilter === 'all')     return list;
    if (quickFilter === 'todo')    return list.filter((x) => x.status !== 'done');
    if (quickFilter === 'urgent')  return list.filter((x) => (x.priority === 'high') || x.urgent);
    if (quickFilter === 'mine')    return list.filter(isMine);
    return list;
  };
  const visibleMyTasks    = applyQuickFilter(myTasks);
  const visibleOtherTasks = applyQuickFilter(otherTasks);
  const visibleDones      = applyQuickFilter(dones);

  const openPriorityMenu = (e, task) => {
    e.stopPropagation();
    if (task.status === 'done') return;
    setPriorityMenuOpen({ taskId: task.id });
  };

  const setPriority = async (taskId, priority) => {
    await supabase.from('tasks').update({
      priority, urgent: priority === 'high',
    }).eq('id', taskId);
    setPriorityMenuOpen(null);
    onChanged();
  };

  // === Swipe actions ===
  const quickToggleDone = async (task) => {
    // Per le istanze ricorrenti, l'id reale è in _origId (le ricorrenze
    // sono soggette a un workflow speciale; per swipe veloce trattiamo
    // l'intera serie).
    const id = task._origId || task.id;
    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: nextStatus }).eq('id', id);
    onChanged();
  };

  const quickDelete = async (task) => {
    const ok = window.confirm(t('td_delete_confirm') || 'Eliminare questo incarico?');
    if (!ok) return;
    const id = task._origId || task.id;
    await supabase.from('tasks').delete().eq('id', id);
    onChanged();
  };

  const quickAssignMe = async (task) => {
    if (!me) return;
    const id = task._origId || task.id;
    // Rimuovi assignees attuali e aggiungi me
    await supabase.from('task_assignees').delete().eq('task_id', id);
    await supabase.from('task_assignees').insert({ task_id: id, member_id: me.id });
    await supabase.from('tasks').update({
      status: 'taken', urgent: false, priority: 'normal',
      delegated_to: null,
    }).eq('id', id);
    onChanged();
  };

  const getFamily = (task) => families?.find((f) => f.id === task.family_id);
  const targetFamilyId = familyId || families?.[0]?.id;
  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  const renderTaskList = (list) => (
    <div className="list">
      {list.map((task) => {
        const isDone = task.status === 'done';
        const isAssignedToMe = me && (
          (task.delegated_to && task.delegated_to === me.id) ||
          (assigneesForTask(task.id).length === 1 && assigneesForTask(task.id)[0].id === me.id)
        );
        // Azioni a destra (swipe LEFT): Completa + Elimina
        const rightActions = [
          {
            id: 'done',
            icon: isDone ? '↩️' : '✓',
            label: isDone ? (t('swipe_undo') || 'Riapri') : (t('swipe_done') || 'Fatto'),
            color: isDone ? '#F39C12' : 'var(--gn)',
            testid: `swipe-done-${task.id}`,
            onAction: () => quickToggleDone(task),
          },
          {
            id: 'delete',
            icon: '🗑',
            label: t('swipe_delete') || 'Elimina',
            color: 'var(--rd)',
            testid: `swipe-delete-${task.id}`,
            onAction: () => quickDelete(task),
          },
        ];
        // Azione a sinistra (swipe RIGHT): quick action contestuale
        const leftAction = isDone
          ? {
              id: 'undo',
              icon: '↩️',
              label: t('swipe_undo') || 'Riapri',
              color: '#F39C12',
              testid: `swipe-undo-${task.id}`,
              onAction: () => quickToggleDone(task),
            }
          : isAssignedToMe
          ? {
              id: 'quickdone',
              icon: '✓',
              label: t('swipe_done') || 'Fatto',
              color: 'var(--gn)',
              testid: `swipe-quickdone-${task.id}`,
              onAction: () => quickToggleDone(task),
            }
          : {
              id: 'assign',
              icon: '👤',
              label: t('swipe_assign_me') || 'A me',
              color: 'var(--ac)',
              testid: `swipe-assign-${task.id}`,
              onAction: () => quickAssignMe(task),
            };
        return (
          <SwipeableRow
            key={task.id}
            rightActions={rightActions}
            leftAction={leftAction}
            disabled={priorityMenuOpen?.taskId === task.id}
            testidContainer={`task-swipe-${task.id}`}
          >
            <TaskCard
              task={task}
              family={isAll ? getFamily(task) : null}
              assignees={assigneesForTask(task.id)}
              statusLabel={ST_LABEL[task.status]}
              onClick={() => {
                if (priorityMenuOpen?.taskId === task.id) {
                  setPriorityMenuOpen(null);
                } else {
                  setSelTask(task);
                }
              }}
              onCheck={(e) => openPriorityMenu(e, task)}
              priorityMenu={priorityMenuOpen?.taskId === task.id}
              onSetPriority={(p) => setPriority(task.id, p)}
              onClosePriorityMenu={() => setPriorityMenuOpen(null)}
            />
          </SwipeableRow>
        );
      })}
    </div>
  );

  if (tasks.length === 0) {
    return (
      <>
        <div className="empty">
          <div className="empty-emoji">📋</div>
          <h3>{t('bacheca_empty_h')}</h3>
          <p>{t('bacheca_empty_p')}</p>
        </div>
        <button className="fab" onClick={() => setShowAdd(true)}>+</button>
        {showAdd && (
          <AddTaskModal familyId={targetFamilyId} families={families} members={allMembers}
            authorMemberId={me?.id}
            onClose={() => setShowAdd(false)}
            onCreated={() => { setShowAdd(false); onChanged(); }} />
        )}
      </>
    );
  }

  return (
    <>
      <BirthdayReminder members={members} session={session} familyId={familyId} families={families} />

      <WeeklySummaryCard
        familyId={isAll ? null : familyId}
        familyName={
          isAll
            ? `${families?.length || 1} famiglie`
            : (families?.find((f) => f.id === familyId)?.name || 'Famiglia')
        }
        tasks={tasks}
        events={[]} /* events live in AgendaTab - omitted here to avoid double-fetch */
        members={members}
      />

      {/* Onboarding checklist progressiva (sparisce a setup completo o dismissato) */}
      {!isAll && family && (
        <OnboardingChecklist
          family={family}
          members={members}
          tasks={tasks}
          notificationPermission={typeof Notification !== 'undefined' ? Notification.permission : 'denied'}
          onAddTask={() => setShowAdd(true)}
          onInviteFamily={() => window.dispatchEvent(new CustomEvent('fammy_request_invite'))}
          onExportAgenda={() => window.dispatchEvent(new CustomEvent('fammy_request_export'))}
        />
      )}

      {/* Filtri rapidi: Tutte / Da fare / Urgenti / Solo mie */}
      <div style={{
        padding: '6px 16px 8px',
        display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
      }} data-testid="bacheca-quick-filters">
        {[
          { id: 'all',    label: t('filter_all')    || '🌍 Tutte',    count: tasks.length },
          { id: 'todo',   label: t('filter_todo')   || '📋 Da fare',  count: todos.length },
          { id: 'urgent', label: t('filter_urgent') || '🚨 Urgenti',  count: tasks.filter((x) => x.priority === 'high').length },
          { id: 'mine',   label: t('filter_mine')   || '👤 Solo mie', count: todos.filter(isMine).length },
        ].map((f) => {
          const active = quickFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              data-testid={`bacheca-filter-${f.id}`}
              onClick={() => setQuickFilter(f.id)}
              style={{
                padding: '7px 14px', borderRadius: 100,
                border: '1.5px solid', borderColor: active ? 'var(--k)' : 'var(--sm)',
                background: active ? 'var(--k)' : 'white',
                color: active ? 'white' : 'var(--km)',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                cursor: 'pointer', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s ease',
              }}>
              <span>{f.label}</span>
              {f.count > 0 && (
                <span style={{
                  background: active ? 'rgba(255,255,255,0.22)' : 'var(--ab)',
                  color: active ? 'white' : 'var(--km)',
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 100,
                }}>{f.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista task: prima le mie, poi le altre (no più sotto-sezioni:
          i filtri rapidi qui sopra forniscono già il filtering UX) */}
      {(visibleMyTasks.length + visibleOtherTasks.length) === 0 ? (
        <p style={{ padding: '24px 22px', color: 'var(--km)', fontSize: 13, textAlign: 'center' }}>
          {quickFilter === 'mine'
            ? t('no_mine_tasks')
            : (t('no_tasks_filter') || '— Nessun risultato con questo filtro —')}
        </p>
      ) : (
        renderTaskList([...visibleMyTasks, ...visibleOtherTasks])
      )}

      {dones.length > 0 && visibleDones.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <CollapsibleSection
            label={t('section_done_short')}
            count={visibleDones.length}
            open={openSections.done}
            onToggle={() => toggle('done')}
          >
            {renderTaskList(visibleDones)}
          </CollapsibleSection>
        </div>
      )}

      <button className="fab" onClick={() => setShowAdd(true)}>+</button>

      {showAdd && (
        <AddTaskModal
          familyId={targetFamilyId}
          families={families}
          members={allMembers}
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
          onEdit={(task) => { setSelTask(null); setEditingTask(task); }}
          onOpenExpense={(task) => { setSelTask(null); onOpenExpenseForTask && onOpenExpenseForTask(task); }}
        />
      )}

      {editingTask && (
        <AddTaskModal
          familyId={editingTask.family_id}
          families={families}
          members={allMembers}
          authorMemberId={me?.id}
          editingTask={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => { setEditingTask(null); onChanged(); }}
        />
      )}
    </>
  );
}

function CollapsibleSection({ label, count, open, onToggle, children, empty, accent, background }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={onToggle} className="collapsible-header"
        style={{
          borderLeft: accent ? `4px solid ${accent}` : '4px solid transparent',
          background: background ? `${background}15` : 'transparent',
          paddingLeft: 16,
        }}>
        <span className="collapsible-arrow" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
        <span className="collapsible-label" style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
        <span className="collapsible-count" style={{ fontWeight: 700, fontSize: 12 }}>{count}</span>
      </button>
      {open && (
        count === 0
          ? <p style={{ padding: '6px 22px 14px', color: 'var(--km)', fontSize: 13 }}>{empty || '—'}</p>
          : children
      )}
    </div>
  );
}

function TaskCard({ task, family, assignees, statusLabel, onClick, onCheck, priorityMenu, onSetPriority, onClosePriorityMenu }) {
  const priority = task.priority || (task.urgent ? 'high' : 'normal');
  const priorityColor = priority === 'high' ? 'var(--rd)'
                      : priority === 'medium' ? '#F39C12'
                      : 'var(--gn)';
  const cardStyle = priority === 'high' ? {
        borderLeft: '6px solid var(--rd)', borderRadius: 0,
        background: 'var(--rd)22',
        boxShadow: '0 0 8px rgba(231, 76, 60, 0.3)',
      } : priority === 'medium' ? {
        borderLeft: '6px solid #F39C12', borderRadius: 0,
        background: '#F39C1222',
      } : { borderRadius: 8 };
  // Quando il menu priorità è aperto, alza lo stacking context della card
  // così il popup vince su qualsiasi card sorella.
  const stackingStyle = priorityMenu
    ? { position: 'relative', zIndex: 1000 }
    : {};
  return (
    <div className={`tc ${task.category} ${task.status === 'done' ? 'done' : ''}`} onClick={onClick} style={{ ...cardStyle, ...stackingStyle }}>
      <div className="tc-row" style={{ position: 'relative' }}>
        <button className="tc-check" onClick={onCheck}
          title={task.status === 'done' ? 'Fatto' : 'Imposta priorità'}
          style={task.status !== 'done' ? {
            background: priorityColor, color: 'white',
            border: `2px solid ${priorityColor}`,
          } : {}}>
          {task.status === 'done' ? '✓' : ' '}
        </button>
        {priorityMenu && (
          <div onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4,
              background: '#ffffff', border: '1px solid var(--sm)', borderRadius: 12,
              padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              zIndex: 1001, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220,
              isolation: 'isolate',
            }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', padding: '4px 8px' }}>Priorità</div>
            <PrioBtn color="var(--gn)" label="🟢 Normale" onClick={() => onSetPriority('normal')} active={priority === 'normal'} />
            <PrioBtn color="#F39C12" label="🟠 Attenzione" onClick={() => onSetPriority('medium')} active={priority === 'medium'} />
            <PrioBtn color="var(--rd)" label="🔴 Urgente / Imprevisto" onClick={() => onSetPriority('high')} active={priority === 'high'} />
            <button onClick={onClosePriorityMenu}
              style={{
                marginTop: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--sm)',
                background: 'white', fontSize: 12, color: 'var(--km)', cursor: 'pointer',
              }}>Annulla</button>
          </div>
        )}
        <span className="tc-emoji">{CAT[task.category] || '📌'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tc-title" style={priority === 'high' ? { color: 'var(--rd)', fontWeight: 700, fontSize: 14 } : {}}>{priority === 'high' ? '🚨 ' : ''}{task.title}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {assignees.length > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 100,
                background: 'var(--ab)', color: 'var(--ac)',
                fontSize: 11, fontWeight: 600,
              }}>
                {assignees.slice(0, 3).map((a) => (
                  <Avatar key={a.id}
                    name={a.name} avatarUrl={a.avatar_url}
                    avatarLetter={a.avatar_letter}
                    avatarColor={a.avatar_color || '#1C1611'}
                    size={16}
                    style={{ display: 'inline-flex' }} />
                ))}
                {assignees.length === 1 ? assignees[0].name : `${assignees.length}`}
              </span>
            )}
            {family && (
              <span style={{
                padding: '2px 8px', borderRadius: 100,
                background: family.color ? family.color + '22' : 'var(--sm)',
                color: family.color || 'var(--km)',
                fontSize: 11, fontWeight: 600,
              }}>{family.emoji} {family.name}</span>
            )}
            {task.note && <span className="tc-meta" style={{ marginTop: 0 }}>{task.note}</span>}
            {task.due_date && (
              <span className="tc-meta" style={{ marginTop: 0 }}>
                📅 {fmtDate(task.due_date)}{task.due_time ? ` · 🕐 ${task.due_time}` : ''}
              </span>
            )}
            {task.location && <span className="tc-meta" style={{ marginTop: 0 }}>📍 {task.location}</span>}
          </div>
        </div>
        <span className={`sp ${task.status}`}>{statusLabel}</span>
      </div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function PrioBtn({ color, label, onClick, active }) {
  // Sfondo SEMPRE opaco: usiamo bianco per inattivo e una versione chiara opaca
  // per l'attivo (mescolando il colore con bianco, no alpha) così non trapela
  // nulla dalla card sottostante.
  const activeBg = color.startsWith('var(')
    ? `color-mix(in srgb, ${color} 18%, #ffffff)`
    : `color-mix(in srgb, ${color} 18%, #ffffff)`;
  return (
    <button onClick={onClick}
      style={{
        padding: '8px 10px', borderRadius: 8,
        border: active ? `2px solid ${color}` : '1px solid var(--sm)',
        background: active ? activeBg : '#ffffff',
        color: 'var(--ink, #1C1611)',
        fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>
      {label}{active ? ' ✓' : ''}
    </button>
  );
}
