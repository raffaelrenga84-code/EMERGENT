import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import BirthdayReminder from '../../components/BirthdayReminder.jsx';
import AddTaskModal from '../../components/AddTaskModal.jsx';
import TaskDetailModal from '../../components/TaskDetailModal.jsx';
import OnboardingChecklist from '../../components/OnboardingChecklist.jsx';
import SwipeableRow from '../../components/SwipeableRow.jsx';
import AbsenceModal from '../../components/AbsenceModal.jsx';
import FabSpeedDial from '../../components/FabSpeedDial.jsx';

const CAT = { care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌' };

export default function BachecaTab({ familyId, families, tasks, members, taskAssignees = [], absences = [], profile, me, session, isAll, onChanged, onOpenExpenseForTask }) {
  const allMembers = members;
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [showAbsence, setShowAbsence] = useState(false);
  const [selTask, setSelTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [openSections, setOpenSections] = useState({ mine: true, all: true, done: false });
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(null);
  // Filtro rapido in cima alla bacheca: todo (default) | all | mine | urgent | followup
  const [quickFilter, setQuickFilter] = useState('todo');
  // Mappa { taskId: [{id, text, created_at, author_id}] } caricata on-demand
  // quando il filtro 'followup' è attivo: mini-timeline degli ultimi system msg.
  const [followUpHistory, setFollowUpHistory] = useState({});
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

  // Una task è "da seguire" se l'ho creata io ma NON è assegnata solo a me
  // (ovvero: l'ho delegata ad altri / a tutta la famiglia → voglio fare follow-up).
  const isFollowUp = (task) => {
    if (!me || task.status === 'done') return false;
    if (task.author_id !== me.id) return false;
    return !isMine(task);
  };

  const todos = tasks.filter((task) => task.status !== 'done');
  const dones = tasks.filter((task) => task.status === 'done');
  const myTasks = todos.filter(isMine);
  const otherTasks = todos.filter((t) => !isMine(t));
  const followUpTasks = todos.filter(isFollowUp);

  // Quick filter applicato ai conteggi della sezione "Fatti"
  const applyQuickFilter = (list) => {
    if (quickFilter === 'all')      return list;
    if (quickFilter === 'todo')     return list.filter((x) => x.status !== 'done');
    if (quickFilter === 'urgent')   return list.filter((x) => (x.priority === 'high') || x.urgent);
    if (quickFilter === 'mine')     return list.filter(isMine);
    if (quickFilter === 'followup') return list.filter(isFollowUp);
    return list;
  };
  const visibleMyTasks    = applyQuickFilter(myTasks);
  const visibleOtherTasks = applyQuickFilter(otherTasks);
  const visibleDones      = applyQuickFilter(dones);

  // Carica la cronologia (system messages) quando il filtro 'followup' è
  // attivo. Una sola query batch per tutti i task_id in follow-up.
  useEffect(() => {
    if (quickFilter !== 'followup' || followUpTasks.length === 0) {
      return;
    }
    let cancelled = false;
    const taskIds = followUpTasks.map((t) => t._origId || t.id);
    (async () => {
      const { data } = await supabase
        .from('task_responses')
        .select('id, task_id, text, created_at, author_id, type')
        .eq('type', 'system')
        .in('task_id', taskIds)
        .order('created_at', { ascending: false });
      if (cancelled || !data) return;
      // Raggruppa per task_id e tieni solo i primi 3 (sono già DESC)
      const grouped = {};
      for (const row of data) {
        if (!grouped[row.task_id]) grouped[row.task_id] = [];
        if (grouped[row.task_id].length < 3) grouped[row.task_id].push(row);
      }
      setFollowUpHistory(grouped);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickFilter, followUpTasks.map((t) => t.id).join(',')]);

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
        // Swipe LEFT: azioni positive (mai distruttive). L'eliminazione
        // resta gestita solo dal modal di dettaglio (richiede conferma +
        // verifica autore).
        const rightActions = isDone
          ? [{
              id: 'undo',
              icon: '↩️',
              label: t('swipe_undo') || 'Riapri',
              color: '#F39C12',
              testid: `swipe-undo-${task.id}`,
              onAction: () => quickToggleDone(task),
            }]
          : isAssignedToMe
          ? [{
              id: 'done',
              icon: '✓',
              label: t('swipe_done') || 'Fatto',
              color: 'var(--gn)',
              testid: `swipe-done-${task.id}`,
              onAction: () => quickToggleDone(task),
            }]
          : [
              {
                id: 'done',
                icon: '✓',
                label: t('swipe_done') || 'Fatto',
                color: 'var(--gn)',
                testid: `swipe-done-${task.id}`,
                onAction: () => quickToggleDone(task),
              },
              {
                id: 'claim',
                icon: '✋',
                label: t('swipe_claim') || 'Me ne occupo',
                color: 'var(--ac)',
                testid: `swipe-claim-${task.id}`,
                onAction: () => quickAssignMe(task),
              },
            ];
        // Swipe RIGHT: azione veloce contestuale (singola, identica a quella
        // rapida dello swipe sinistro nello stato corrente).
        const leftAction = isDone
          ? {
              id: 'undo',
              icon: '↩️',
              label: t('swipe_undo') || 'Riapri',
              color: '#F39C12',
              testid: `swipe-quick-undo-${task.id}`,
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
              icon: '✋',
              label: t('swipe_claim') || 'Me ne occupo',
              color: 'var(--ac)',
              testid: `swipe-quick-claim-${task.id}`,
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
              isFollowUp={isFollowUp(task)}
              followUpLabel={t('badge_follow_up') || '✏️ Creata da te'}
              followUpHistory={
                quickFilter === 'followup' && isFollowUp(task)
                  ? (followUpHistory[task._origId || task.id] || [])
                  : []
              }
              members={members}
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
        <FabSpeedDial
          testid="bacheca-fab"
          actions={[
            { id: 'task',    icon: '📋', label: t('fab_new_task') || 'Nuovo incarico', onClick: () => setShowAdd(true), testid: 'bacheca-fab-new-task' },
            { id: 'absence', icon: '✈️', label: t('fab_new_absence') || 'Nuova assenza', onClick: () => setShowAbsence(true), testid: 'bacheca-fab-new-absence' },
          ]}
        />
        {showAdd && (
          <AddTaskModal familyId={targetFamilyId} families={families} members={allMembers}
            authorMemberId={me?.id}
            absences={absences}
            onClose={() => setShowAdd(false)}
            onCreated={() => { setShowAdd(false); onChanged(); }} />
        )}
        {showAbsence && (
          <AbsenceModal session={session} profile={profile} families={families}
            tasks={tasks} members={allMembers}
            onClose={() => setShowAbsence(false)}
            onSaved={() => { setShowAbsence(false); onChanged(); }} />
        )}
      </>
    );
  }

  return (
    <>
      <BirthdayReminder members={members} session={session} familyId={familyId} families={families} />

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

      {/* Filtri rapidi: Da fare (default) → Urgenti → Solo mie → Da seguire → Tutte */}
      <div style={{
        padding: '6px 16px 8px',
        display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
      }} data-testid="bacheca-quick-filters">
        {[
          { id: 'todo',     label: t('filter_todo')     || '📋 Da fare',    count: todos.length },
          { id: 'urgent',   label: t('filter_urgent')   || '🚨 Urgenti',    count: tasks.filter((x) => x.priority === 'high').length },
          { id: 'mine',     label: t('filter_mine')     || '👤 Solo mie',   count: myTasks.length },
          { id: 'followup', label: t('filter_followup') || '👁️ Da seguire', count: followUpTasks.length },
          { id: 'all',      label: t('filter_all')      || '🌍 Tutte',      count: tasks.length },
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

      {/* Sezione "Fatti": SEMPRE visibile (a prescindere dal filtro rapido)
          perché serve da archivio degli incarichi completati. Collapsata di
          default. */}
      {dones.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <CollapsibleSection
            label={t('section_done_short')}
            count={dones.length}
            open={openSections.done}
            onToggle={() => toggle('done')}
          >
            {renderTaskList(dones)}
          </CollapsibleSection>
        </div>
      )}

      <FabSpeedDial
        testid="bacheca-fab-2"
        actions={[
          { id: 'task',    icon: '📋', label: t('fab_new_task') || 'Nuovo incarico', onClick: () => setShowAdd(true), testid: 'bacheca-fab2-new-task' },
          { id: 'absence', icon: '✈️', label: t('fab_new_absence') || 'Nuova assenza', onClick: () => setShowAbsence(true), testid: 'bacheca-fab2-new-absence' },
        ]}
      />

      {showAdd && (
        <AddTaskModal
          familyId={targetFamilyId}
          families={families}
          members={allMembers}
          authorMemberId={me?.id}
          absences={absences}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onChanged(); }}
        />
      )}

      {showAbsence && (
        <AbsenceModal
          session={session}
          profile={profile}
          families={families}
          tasks={tasks}
          members={allMembers}
          onClose={() => setShowAbsence(false)}
          onSaved={() => { setShowAbsence(false); onChanged(); }}
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
          absences={absences}
          editingTask={editingTask}
          onClose={() => setEditingTask(null)}
          onUpdated={() => { setEditingTask(null); onChanged(); }}
        />
      )}

      {/* Bottom-sheet priority menu (fuori dallo SwipeableRow per non essere
          clippato dall'overflow:hidden delle card). */}
      {priorityMenuOpen && (() => {
        const target = tasks.find((tt) => tt.id === priorityMenuOpen.taskId);
        const currentPriority = target?.priority || (target?.urgent ? 'high' : 'normal');
        return (
          <div
            data-testid="priority-sheet-backdrop"
            onClick={() => setPriorityMenuOpen(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1500,
              background: 'rgba(28,22,17,0.35)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}>
            <div
              onClick={(e) => e.stopPropagation()}
              data-testid="priority-sheet"
              style={{
                width: '100%', maxWidth: 520,
                background: 'white',
                borderTopLeftRadius: 22, borderTopRightRadius: 22,
                padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
                display: 'flex', flexDirection: 'column', gap: 8,
                animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
              }}>
              <div style={{
                width: 40, height: 4, borderRadius: 4, background: 'var(--sm)',
                margin: '0 auto 8px',
              }} />
              <div style={{
                fontSize: 11, fontWeight: 800, color: 'var(--km)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
                textAlign: 'center', marginBottom: 6,
              }}>{t('priority_sheet_title') || 'Imposta priorità'}</div>
              <PrioBtn color="var(--gn)" label="🟢 Normale"
                onClick={() => setPriority(priorityMenuOpen.taskId, 'normal')}
                active={currentPriority === 'normal'} testid="prio-normal" />
              <PrioBtn color="#F39C12" label="🟠 Attenzione"
                onClick={() => setPriority(priorityMenuOpen.taskId, 'medium')}
                active={currentPriority === 'medium'} testid="prio-medium" />
              <PrioBtn color="var(--rd)" label="🔴 Urgente / Imprevisto"
                onClick={() => setPriority(priorityMenuOpen.taskId, 'high')}
                active={currentPriority === 'high'} testid="prio-high" />
              <button onClick={() => setPriorityMenuOpen(null)}
                data-testid="priority-sheet-cancel"
                style={{
                  marginTop: 6, padding: '12px', borderRadius: 12,
                  border: '1px solid var(--sm)', background: 'white',
                  fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
                }}>{t('cancel') || 'Annulla'}</button>
            </div>
          </div>
        );
      })()}
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

function TaskCard({ task, family, assignees, statusLabel, isFollowUp, followUpLabel, followUpHistory = [], members = [], onClick, onCheck, priorityMenu, onSetPriority, onClosePriorityMenu }) {
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
            {isFollowUp && (
              <span
                data-testid={`task-followup-badge-${task.id}`}
                style={{
                  padding: '2px 8px', borderRadius: 100,
                  background: 'rgba(193, 98, 75, 0.12)',
                  color: 'var(--ac)',
                  fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.01em',
                  border: '1px solid rgba(193, 98, 75, 0.25)',
                }}>{followUpLabel}</span>
            )}
          </div>
        </div>
        <span className={`sp ${task.status}`}>{statusLabel}</span>
      </div>

      {/* Mini-timeline cronologia follow-up (visibile solo dentro il filtro
          "Da seguire" e quando ci sono system messages da mostrare). */}
      {isFollowUp && followUpHistory.length > 0 && (
        <FollowUpTimeline events={followUpHistory} members={members} />
      )}
    </div>
  );
}

function FollowUpTimeline({ events, members }) {
  return (
    <div
      data-testid="task-followup-timeline"
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px dashed rgba(28, 22, 17, 0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--km)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        marginBottom: 2,
      }}>
        🕘 Cronologia
      </div>
      {events.map((ev) => {
        const { icon, tone } = classifySystemMessage(ev.text);
        const author = members.find((m) => m.id === ev.author_id);
        return (
          <div key={ev.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            fontSize: 12, color: 'var(--k)', lineHeight: 1.4,
          }}>
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: -1 }}>{icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: tone === 'urgent' ? 'var(--rd)' : 'var(--k)', fontWeight: 600 }}>
                {truncate(ev.text, 60)}
              </span>
              {' '}
              <span style={{ color: 'var(--km)', fontSize: 11 }}>
                · {author?.name ? `${author.name.split(' ')[0]} · ` : ''}{relativeTime(ev.created_at)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function relativeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ieri';
  if (days < 7) return `${days}g fa`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Mappa il testo del system message all'icona + tono.
// I pattern coprono i messaggi creati dal codice esistente (TaskDetailModal
// e useEventNotifications follow-up actions).
function classifySystemMessage(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('sollecito') || t.includes('reminder'))    return { icon: '🔔', tone: 'urgent' };
  if (t.includes('imprevisto') || t.includes('unexpected')) return { icon: '⚠️', tone: 'urgent' };
  if (t.includes('rifiut') || t.includes('refus'))          return { icon: '🙅', tone: 'info' };
  if (t.includes('me ne occupo') || t.includes('claim'))    return { icon: '✋', tone: 'info' };
  if (t.includes('delega') || t.includes('lo fa'))          return { icon: '🧡', tone: 'info' };
  if (t.includes('ricorrenza') || t.includes('recurrence')) return { icon: '🔁', tone: 'info' };
  return { icon: '·', tone: 'info' };
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function PrioBtn({ color, label, onClick, active, testid }) {
  // Sfondo SEMPRE opaco: usiamo bianco per inattivo e una versione chiara opaca
  // per l'attivo (mescolando il colore con bianco, no alpha) così non trapela
  // nulla dalla card sottostante.
  const activeBg = `color-mix(in srgb, ${color} 18%, #ffffff)`;
  return (
    <button onClick={onClick}
      data-testid={testid}
      style={{
        padding: '14px 16px', borderRadius: 12,
        border: active ? `2px solid ${color}` : '1.5px solid var(--sm)',
        background: active ? activeBg : '#ffffff',
        color: 'var(--ink, #1C1611)',
        fontSize: 15, fontWeight: 600, textAlign: 'left', cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}>
      {label}{active ? ' ✓' : ''}
    </button>
  );
}
