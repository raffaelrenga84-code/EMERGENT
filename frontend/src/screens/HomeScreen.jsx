import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { useEventNotifications } from '../lib/useEventNotifications.jsx';
import { usePullToRefresh } from '../lib/usePullToRefresh.jsx';
import { useAbsences } from '../lib/useAbsences.js';
import NotificationsPrompt from '../components/NotificationsPrompt.jsx';
import FamilySwitcher from '../components/FamilySwitcher.jsx';
import BachecaTab from './tabs/BachecaTab.jsx';
import AgendaTab from './tabs/AgendaTab.jsx';
import SpeseTab from './tabs/SpeseTab.jsx';
import FamilyTab from './tabs/FamilyTab.jsx';
import ProfileTab from './tabs/ProfileTab.jsx';
import NewFamilyModal from '../components/NewFamilyModal.jsx';
import UpdateBanner from '../components/UpdateBanner.jsx';
import OnboardingTour from '../components/OnboardingTour.jsx';
import AIAssistantDrawer from '../components/AIAssistantDrawer.jsx';
import AddTaskModal from '../components/AddTaskModal.jsx';
import AddEventModal from '../components/AddEventModal.jsx';
import { useUnreadTaskCount } from '../lib/useUnreadTaskCount.js';

export default function HomeScreen({ session, profile, families, onRefresh, onFamilyUpdated }) {
  const { t } = useT();
  const [activeFamily, setActiveFamily] = useState('all');
  const [activeTab, setActiveTab] = useState('bacheca');
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [taskAssignees, setTaskAssignees] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem('fammy_onboarding_done'); } catch (e) { return false; }
  });
  const [showUpdateBanner, setShowUpdateBanner] = useState(true);
  const [pendingExpenseTask, setPendingExpenseTask] = useState(null);
  // AI-driven prefill modals (opened when the AI assistant emits an ACTION)
  const [aiTaskPrefill, setAiTaskPrefill] = useState(null); // { title, category, due_date }
  const [aiEventPrefill, setAiEventPrefill] = useState(null); // { title, starts_at, location }
  // Task da aprire automaticamente quando arriva da una push notification
  // (Service Worker → window.dispatchEvent('fammy_open_task'))
  const [openTaskId, setOpenTaskId] = useState(null);

  // Ascolta notifiche push che chiedono di aprire un task specifico (chat).
  // Cambia tab a Bacheca e setta openTaskId → BachecaTab lo intercetta e apre
  // il TaskDetailModal su quel task.
  useEffect(() => {
    const handler = (e) => {
      const taskId = e?.detail?.taskId;
      if (!taskId) return;
      setActiveTab('bacheca');
      setActiveFamily('all');
      setOpenTaskId(taskId);
    };
    window.addEventListener('fammy_open_task', handler);
    return () => window.removeEventListener('fammy_open_task', handler);
  }, []);

  // Helper: pick the family the AI-created item should land in.
  // Priority: currently-active family → first family the user belongs to.
  const targetFamilyForAI = () => {
    if (activeFamily && activeFamily !== 'all') return activeFamily;
    return families[0]?.id || null;
  };

  const handleAIAction = (action) => {
    if (!action || !action.type) return;
    if (action.type === 'create_task') {
      setAiTaskPrefill({
        title: action.data?.title || '',
        category: ['care', 'home', 'health', 'admin', 'spese', 'other'].includes(action.data?.category) ? action.data.category : 'other',
        due_date: action.data?.due_date && action.data.due_date !== 'null' ? action.data.due_date : '',
      });
    } else if (action.type === 'create_event') {
      setAiEventPrefill({
        title: action.data?.title || '',
        starts_at: action.data?.starts_at && action.data.starts_at !== 'null' ? action.data.starts_at : '',
        location: action.data?.location && action.data.location !== 'null' ? action.data.location : '',
      });
    }
  };

  const openExpenseForTask = (task) => {
    setPendingExpenseTask(task);
    setActiveTab('spese');
  };

  // Assenze (condivise via RLS — vedo le mie + quelle delle famiglie a cui appartengo).
  // Caricate qui in alto per essere disponibili al notification hook.
  const { absences, refresh: refreshAbsences } = useAbsences(session, refreshKey);

  // Auto-refresh via realtime + notifiche push per nuovi task/eventi/imprevisti
  const notificationControl = useEventNotifications(
    session, profile, families, events, taskAssignees, members, tasks,
    () => setRefreshKey((k) => k + 1),
    absences,
  );

  useEffect(() => {
    if (activeFamily !== 'all' && !families.find((f) => f.id === activeFamily) && families.length > 0) {
      setActiveFamily(families[0].id);
    }
  }, [families, activeFamily]);

  useEffect(() => {
    if (!activeFamily) return;
    const dataFamilyIds = activeFamily === 'all' ? families.map((f) => f.id) : [activeFamily];
    const allFamilyIds = families.map((f) => f.id);
    if (dataFamilyIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const [tRes, mRes, eRes, exRes] = await Promise.all([
        supabase.from('tasks').select('*').in('family_id', dataFamilyIds).order('created_at', { ascending: false }),
        supabase.from('members').select('*').in('family_id', allFamilyIds).order('created_at'),
        supabase.from('events').select('*').in('family_id', dataFamilyIds).order('starts_at'),
        supabase.from('expenses').select('*').in('family_id', dataFamilyIds).order('created_at', { ascending: false }),
      ]);
      if (cancelled) return;

      const taskIds = (tRes.data || []).map((t) => t.id);
      let aRes = { data: [] };
      if (taskIds.length > 0) {
        aRes = await supabase.from('task_assignees').select('*').in('task_id', taskIds);
      }

      setTasks(tRes.data || []);
      setMembers(mRes.data || []);
      setEvents(eRes.data || []);
      setExpenses(exRes.data || []);
      setTaskAssignees(aRes.data || []);
    })();
    return () => { cancelled = true; };
  }, [activeFamily, refreshKey, families]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const refreshAll = () => { refresh(); onRefresh && onRefresh(); };

  // Optimistic update locale per i membri (mantiene l'array `members` aggiornato
  // istantaneamente quando si cambia foto/colore/emoji a un membro). Il successivo
  // refresh re-fetcha da Supabase per garantire eventual consistency.
  const updateMemberLocally = (updated) => {
    if (!updated || !updated.id) return;
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
  };

  // Pull-to-refresh: tira giù il dito in cima a qualsiasi tab → re-fetch
  const { indicator: pullIndicator } = usePullToRefresh(() => { refreshAll(); refreshAbsences(); });

  const isAll = activeFamily === 'all';
  const family = isAll ? null : families.find((f) => f.id === activeFamily);
  const me = isAll
    ? members.find((m) => m.user_id === session.user.id)
    : members.find((m) => m.user_id === session.user.id && m.family_id === activeFamily);

  // Nasconde l'header (titolo + family chip) su Profilo e Agenda.
  // Su Agenda lo nascondiamo per dare più spazio al calendario; il family chip
  // viene reso inline nelle altre tab.
  const showHeader = activeTab !== 'profile' && activeTab !== 'agenda';

  // ===== Badge numerici sulle tab home (stile WhatsApp) =====
  // Bacheca: numero task NON ancora fatti che mi riguardano (assegnati a me
  //          o creati da me, escludendo "done" e "paid").
  // Agenda: numero eventi di OGGI (mostra "cose in arrivo" oggi).
  // Spese: numero spese in cui devo a qualcuno (non pagate da me).
  const today = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  })();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const myAssigneeIds = new Set(
    members.filter((m) => m.user_id === session.user.id).map((m) => m.id)
  );
  // Hook unread: numero di task con messaggi non letti dopo la mia ultima
  // apertura. Decrementa automaticamente quando apro un task (markTaskRead
  // in TaskDetailModal).
  const { count: unreadChatsCount } = useUnreadTaskCount(tasks, myAssigneeIds);

  const tasksAboutMe = tasks.filter((task) => {
    if (task.status === 'done' || task.status === 'paid') return false;
    if (task.author_id && myAssigneeIds.has(task.author_id)) return true;
    const linked = taskAssignees.filter((a) => a.task_id === task.id);
    return linked.some((a) => myAssigneeIds.has(a.member_id));
  });
  // Bacheca: prima ho i messaggi non letti (priorità), poi i task da fare
  // come fallback (se non ci sono unread chat).
  const bachecaBadge = unreadChatsCount > 0 ? unreadChatsCount : tasksAboutMe.length;

  const todayEvents = events.filter((ev) => {
    if (!ev.starts_at) return false;
    const d = new Date(ev.starts_at);
    return d >= today && d < tomorrow;
  });
  const agendaBadge = todayEvents.length;

  // Spese da pagare: per ogni spesa NON saldata, conto 1 se sono uno degli
  // expense_shares con paid_amount < amount. Fallback: spese non saldate
  // in cui sono debtor/creditor.
  // NB: gli expense_shares non sono caricati qui per non appesantire la
  // home. Uso un'euristica: spese create da qualcun altro e non ancora
  // dello stato "settled".
  const speseBadge = expenses.filter((ex) => !ex.settled && ex.created_by_member_id && !myAssigneeIds.has(ex.created_by_member_id)).length;

  return (
    <div className="scr">
      {pullIndicator}
      {/* Notifications prompt — bloccante una sola volta finché 'default' */}
      {notificationControl.notificationPermission === 'default' && (
        <NotificationsPrompt
          onGranted={() => notificationControl.setNotificationsEnabled?.(true)}
        />
      )}
      {showUpdateBanner && <UpdateBanner onDismiss={() => setShowUpdateBanner(false)} />}

      {showOnboarding && (
        <OnboardingTour onClose={() => setShowOnboarding(false)} />
      )}

      {showHeader && (
        <Header
          family={family}
          members={isAll ? members.filter((m) => m.family_id === families[0]?.id) : members}
          allMembers={members}
          tasks={tasks}
          families={families}
          activeFamily={activeFamily}
          isAll={isAll}
          onSwitchFamily={setActiveFamily}
          onNewFamily={() => setShowNewFamily(true)}
        />
      )}

      <div className="tab-content">
        {activeTab === 'bacheca' && (
          <BachecaTab
            familyId={isAll ? null : activeFamily}
            families={families}
            tasks={tasks}
            members={members}
            taskAssignees={taskAssignees}
            absences={absences}
            profile={profile}
            me={me}
            session={session}
            isAll={isAll}
            onChanged={() => { refresh(); refreshAbsences(); }}
            onOpenExpenseForTask={openExpenseForTask}
            openTaskId={openTaskId}
            onTaskOpened={() => setOpenTaskId(null)}
          />
        )}
        {activeTab === 'agenda' && (
          <AgendaTab
            familyId={isAll ? null : activeFamily}
            events={events}
            tasks={tasks}
            members={members}
            me={me}
            isAll={isAll}
            families={families}
            absences={absences}
            session={session}
            profile={profile}
            onSwitchFamily={setActiveFamily}
            onChanged={() => { refresh(); refreshAbsences(); }}
          />
        )}
        {activeTab === 'spese' && (
          <SpeseTab
            familyId={isAll ? null : activeFamily}
            families={families}
            expenses={expenses}
            tasks={tasks}
            members={members}
            me={me}
            onChanged={refresh}
            pendingTask={pendingExpenseTask}
            onClearPendingTask={() => setPendingExpenseTask(null)}
          />
        )}
        {activeTab === 'famiglia' && (
          <FamilyTab
            family={family}
            members={members}
            session={session}
            families={families}
            activeFamily={activeFamily}
            isAll={isAll}
            absences={absences}
            profile={profile}
            tasks={tasks}
            onSwitchFamily={setActiveFamily}
            onNewFamily={() => setShowNewFamily(true)}
            onFamilyUpdated={onFamilyUpdated}
            onMemberUpdated={updateMemberLocally}
            onChanged={() => { refreshAll(); refreshAbsences(); }}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            session={session} profile={profile}
            families={families} members={members} me={me}
            tasks={tasks} events={events}
            activeFamilyId={isAll ? null : activeFamily}
            onChanged={refreshAll}
            notificationControl={notificationControl} />
        )}
      </div>

      {showNewFamily && (
        <NewFamilyModal
          session={session}
          profile={profile}
          onClose={() => setShowNewFamily(false)}
          onCreated={() => { setShowNewFamily(false); refreshAll(); }}
        />
      )}

      <nav className="bnav">
        <NavBtn icon="🏠" label={t('nav_bacheca')} active={activeTab === 'bacheca'} badge={bachecaBadge} onClick={() => { setActiveTab('bacheca'); setActiveFamily('all'); }} />
        <NavBtn icon="📅" label={t('nav_agenda')} active={activeTab === 'agenda'} badge={agendaBadge} onClick={() => { setActiveTab('agenda'); if (families.length > 1) setActiveFamily('all'); }} />
        <NavBtn icon="💶" label={t('nav_spese')} active={activeTab === 'spese'} badge={speseBadge} onClick={() => { setActiveTab('spese'); if (families.length > 1) setActiveFamily('all'); }} />
        <NavBtn icon="👥" label={t('nav_family')} active={activeTab === 'famiglia'} onClick={() => { setActiveTab('famiglia'); setActiveFamily('all'); }} />
        <NavBtn icon="👤" label={t('nav_profile')} active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
      </nav>

      <AIAssistantDrawer
        session={session}
        families={families}
        members={members}
        tasks={tasks}
        events={events}
        activeFamily={activeFamily}
        activeTab={activeTab}
        onAction={handleAIAction}
      />

      {aiTaskPrefill && targetFamilyForAI() && (
        <AddTaskModal
          familyId={targetFamilyForAI()}
          families={families}
          members={members}
          authorMemberId={me?.id}
          initialTitle={aiTaskPrefill.title}
          initialCategory={aiTaskPrefill.category}
          initialDueDate={aiTaskPrefill.due_date}
          initialDueTime={aiTaskPrefill.due_time || ''}
          initialLocation={aiTaskPrefill.location || ''}
          onClose={() => setAiTaskPrefill(null)}
          onCreated={() => { setAiTaskPrefill(null); setRefreshKey((k) => k + 1); }}
        />
      )}

      {aiEventPrefill && targetFamilyForAI() && (
        <AddEventModal
          familyId={targetFamilyForAI()}
          families={families}
          members={members}
          authorMemberId={me?.id}
          initialTitle={aiEventPrefill.title}
          initialStartsAt={aiEventPrefill.starts_at}
          initialLocation={aiEventPrefill.location}
          onClose={() => setAiEventPrefill(null)}
          onCreated={() => { setAiEventPrefill(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function Header({ family, members, allMembers, tasks, families, activeFamily, isAll, onSwitchFamily, onNewFamily }) {
  const { t } = useT();
  const todoCount = tasks.filter((task) => task.status !== 'done').length;

  return (
    <header className="hdr">
      <div style={{ flex: 1, minWidth: 0 }}>
        <FamilySwitcher
          families={families}
          activeFamily={activeFamily}
          isAll={isAll}
          onSwitch={onSwitchFamily}
          testidPrefix="header-family"
          variant="title"
        />
        <p className="sub" style={{ marginTop: 4 }}>
          {isAll
            ? `${families.length} ${families.length === 1 ? t('family_one_label') : t('family_other_label')} · ${todoCount} ${t('todo_label')}`
            : `${members.length} ${members.length === 1 ? t('member_one') : t('member_other')} · ${todoCount} ${t('todo_label')}`
          }
        </p>
      </div>
    </header>
  );
}

function NavBtn({ icon, label, active, badge, onClick }) {
  // Badge stile WhatsApp: pallino rosso sopra all'icona con il numero.
  // - 0 → nascosto
  // - 1-99 → numero
  // - 100+ → "99+"
  const showBadge = typeof badge === 'number' && badge > 0;
  const badgeText = badge > 99 ? '99+' : String(badge);
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <span className="ic" style={{ position: 'relative', display: 'inline-block' }}>
        {icon}
        {showBadge && (
          <span
            data-testid="nav-badge"
            style={{
              position: 'absolute',
              top: -6, right: -10,
              minWidth: 18, height: 18,
              padding: '0 5px',
              borderRadius: 100,
              background: '#FF3B30',
              color: 'white',
              fontSize: 10, fontWeight: 800,
              lineHeight: '18px',
              textAlign: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
              border: '1.5px solid white',
            }}>{badgeText}</span>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}
