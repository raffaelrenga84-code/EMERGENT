import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import BirthdayReminder from '../../components/BirthdayReminder.jsx';
import AddTaskModal from '../../components/AddTaskModal.jsx';
import TaskDetailModal from '../../components/TaskDetailModal.jsx';
import WeeklySummaryCard from '../../components/WeeklySummaryCard.jsx';

const CAT = { care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌' };

export default function BachecaTab({ familyId, families, tasks, members, taskAssignees = [], me, session, isAll, onChanged, onOpenExpenseForTask }) {
  const allMembers = members;
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [selTask, setSelTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [openSections, setOpenSections] = useState({ mine: true, all: true, done: false });
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(null);

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

  const getFamily = (task) => families?.find((f) => f.id === task.family_id);
  const targetFamilyId = familyId || families?.[0]?.id;
  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  const renderTaskList = (list) => (
    <div className="list">
      {list.map((task) => (
        <TaskCard
          key={task.id} task={task}
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
      ))}
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

      <div style={{ marginBottom: 24 }}>
        <CollapsibleSection
          label={t('section_mine')}
          count={myTasks.length}
          open={openSections.mine}
          onToggle={() => toggle('mine')}
          empty={t('no_mine_tasks')}
          accent="var(--am)"
          background="var(--am)"
        >
          {myTasks.length > 0 && renderTaskList(myTasks)}
        </CollapsibleSection>
      </div>

      <div style={{ marginTop: 20 }}>
        <CollapsibleSection
          label={t('section_all')}
          count={otherTasks.length}
          open={openSections.all}
          onToggle={() => toggle('all')}
          background="var(--ab)"
        >
          {otherTasks.length > 0 ? renderTaskList(otherTasks) : (
            <p style={{ padding: '0 22px 12px', color: 'var(--km)', fontSize: 13 }}>—</p>
          )}
        </CollapsibleSection>
      </div>

      {dones.length > 0 && (
        <CollapsibleSection
          label={t('section_done_short')}
          count={dones.length}
          open={openSections.done}
          onToggle={() => toggle('done')}
        >
          {renderTaskList(dones)}
        </CollapsibleSection>
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
