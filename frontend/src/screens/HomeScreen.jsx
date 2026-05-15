import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { useEventNotifications } from '../lib/useEventNotifications.jsx';
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

export default function HomeScreen({ session, profile, families, onRefresh }) {
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

  // Auto-refresh via realtime + notifiche push per nuovi task/eventi/imprevisti
  const notificationControl = useEventNotifications(
    session, profile, families, events, taskAssignees, members, tasks,
    () => setRefreshKey((k) => k + 1)
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

  const isAll = activeFamily === 'all';
  const family = isAll ? null : families.find((f) => f.id === activeFamily);
  const me = isAll
    ? members.find((m) => m.user_id === session.user.id)
    : members.find((m) => m.user_id === session.user.id && m.family_id === activeFamily);

  // Nasconde l'header (titolo + family chip) su Profilo e Agenda.
  // Su Agenda lo nascondiamo per dare più spazio al calendario; il family chip
  // viene reso inline nelle altre tab.
  const showHeader = activeTab !== 'profile' && activeTab !== 'agenda';

  return (
    <div className="scr">
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
            me={me}
            session={session}
            isAll={isAll}
            onChanged={refresh}
            onOpenExpenseForTask={openExpenseForTask}
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
            onSwitchFamily={setActiveFamily}
            onChanged={refresh}
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
            onSwitchFamily={setActiveFamily}
            onNewFamily={() => setShowNewFamily(true)}
            onChanged={refreshAll}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileTab session={session} profile={profile} onChanged={refreshAll} notificationControl={notificationControl} />
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
        <NavBtn icon="🏠" label={t('nav_bacheca')} active={activeTab === 'bacheca'} onClick={() => { setActiveTab('bacheca'); setActiveFamily('all'); }} />
        <NavBtn icon="📅" label={t('nav_agenda')} active={activeTab === 'agenda'} onClick={() => { setActiveTab('agenda'); if (families.length > 1) setActiveFamily('all'); }} />
        <NavBtn icon="💶" label={t('nav_spese')} active={activeTab === 'spese'} onClick={() => { setActiveTab('spese'); if (families.length > 1) setActiveFamily('all'); }} />
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
    <>
      <header className="hdr">
        <div>
          {isAll ? (
            <>
              <h1>🌍 {t('all_families_chip').replace(/^🌍\s?/, '')}</h1>
              <p className="sub">
                {families.length} famiglie · {todoCount} {t('todo_label')}
              </p>
            </>
          ) : (
            <>
              <h1>{family?.emoji} {family?.name}</h1>
              <p className="sub">
                {members.length} {members.length === 1 ? t('member_one') : t('member_other')} · {todoCount} {t('todo_label')}
              </p>
            </>
          )}
        </div>
      </header>

      <div className="fam-switcher-wrap">
        <div className="fam-switcher">
          {families.length > 1 && (
            <button
              className={`fam-chip ${isAll ? 'on' : ''}`}
              onClick={() => onSwitchFamily('all')}>
              {t('all_families_chip')}
            </button>
          )}
          {families.map((f) => (
            <button key={f.id}
              className={`fam-chip ${activeFamily === f.id ? 'on' : ''}`}
              onClick={() => onSwitchFamily(f.id)}>
              {f.emoji} {f.name}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function NavBtn({ icon, label, active, onClick }) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <span className="ic">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
