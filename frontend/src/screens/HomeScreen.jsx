import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { isImageFile } from '../lib/fileKind.js';
import { useT } from '../lib/i18n.jsx';
import { useEventNotifications } from '../lib/useEventNotifications.jsx';
import { usePullToRefresh } from '../lib/usePullToRefresh.jsx';
import { useAbsences } from '../lib/useAbsences.js';
import NotificationsPrompt from '../components/NotificationsPrompt.jsx';
import {
  shouldShowNotifPrompt, markNotifPromptDismissed, markNotifPromptStopped,
  markPromptShownThisSession, wasPromptShownThisSession,
} from '../lib/installPrompt.js';
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
import MedicationReminderToast from '../components/MedicationReminderToast.jsx';
import FeedbackToastSubscriber from '../components/FeedbackToastSubscriber.jsx';
import GlobalSearch from '../components/GlobalSearch.jsx';
import { useUnreadTaskCount } from '../lib/useUnreadTaskCount.js';
import { useMedicationReminders } from '../lib/useMedicationReminders.js';

export default function HomeScreen({ session, profile, families, onRefresh, onFamilyUpdated }) {
  const { t } = useT();
  const [activeFamily, setActiveFamily] = useState('all');
  // Schermata iniziale: quale tab vedere all'apertura (preferenza per-dispositivo)
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const v = localStorage.getItem('fammy_start_tab');
      return (v === 'agenda' || v === 'spese') ? v : 'bacheca';
    } catch (_) { return 'bacheca'; }
  });
  // Signal incrementale: cambia ogni volta che vogliamo aprire l'inbox
  // feedback nel ProfileTab (es. tap sul toast realtime).
  const [openFeedbackInboxSignal, setOpenFeedbackInboxSignal] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [taskAssignees, setTaskAssignees] = useState([]);
  // Meta per card Bacheca: { [taskId]: { msgs: n, photos: [{id, url}] } }
  const [taskMeta, setTaskMeta] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem('fammy_onboarding_done'); } catch (e) { return false; }
  });
  const [showUpdateBanner, setShowUpdateBanner] = useState(true);
  const [pendingExpenseTask, setPendingExpenseTask] = useState(null);
  // Ricerca globale (cross-tab)
  const [showSearch, setShowSearch] = useState(false);
  const [openEventId, setOpenEventId] = useState(null);
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
      let rRes = { data: [] };
      let atRes = { data: [] };
      if (taskIds.length > 0) {
        [aRes, rRes, atRes] = await Promise.all([
          supabase.from('task_assignees').select('*').in('task_id', taskIds),
          supabase.from('task_responses').select('task_id, type, created_at, author_id').in('task_id', taskIds),
          supabase.from('task_attachments').select('id, task_id, file_path, file_name').in('task_id', taskIds),
        ]);
      }

      // Conteggio messaggi chat reali (non system) + ultimo messaggio (per
      // badge "non letto" stile WhatsApp) + miniature foto per card.
      const meta = {};
      const metaFor = (id) => (meta[id] = meta[id] || { msgs: 0, photos: [], lastMsg: null });
      for (const r of rRes.data || []) {
        if (r.type === 'system') continue;
        const mm = metaFor(r.task_id);
        mm.msgs += 1;
        if (!mm.lastMsg || r.created_at > mm.lastMsg.at) {
          mm.lastMsg = { at: r.created_at, author_id: r.author_id };
        }
      }
      const atts = atRes.data || [];
      if (atts.length > 0) {
        // Bucket privato → signed URLs in batch per le miniature
        const { data: sigs } = await supabase.storage
          .from('task-attachments')
          .createSignedUrls(atts.map((a) => a.file_path), 60 * 60);
        atts.forEach((a, i) => {
          const mm = metaFor(a.task_id);
          if (isImageFile(a.file_name || a.file_path)) {
            mm.photos.push({ id: a.id, url: sigs?.[i]?.signedUrl || null });
          } else {
            // Documenti (PDF ecc.): solo contatore 📎 sulla card
            mm.docs = (mm.docs || 0) + 1;
          }
        });
      }

      setTasks(tRes.data || []);
      setMembers(mRes.data || []);
      setEvents(eRes.data || []);
      setExpenses(exRes.data || []);
      setTaskAssignees(aRes.data || []);
      setTaskMeta(meta);
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

  // Trigger esterno per aprire l'AI drawer dall'header di Agenda.
  // Ogni volta che incrementiamo, il drawer si apre.
  const [aiOpenSignal, setAiOpenSignal] = useState(0);
  const onOpenAI = () => setAiOpenSignal((s) => s + 1);


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

  // Hook reminder medicine: monta i reminder per i membri "assistiti"
  // della famiglia. Aggiorna in tempo reale (realtime + polling ogni 60s).
  const myMember = members.find((mm) => mm.user_id === session.user.id);
  const meds = useMedicationReminders(members, myMember?.id || null);

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
      {/* Notifications prompt — appare dopo che l'utente ha creato il primo
          task (markFirstTaskCreated in BachecaTab/AddTask). Cooldown 3gg,
          max 3 tentativi, mai insieme ad altri prompt. */}
      {shouldShowNotifPrompt() && !wasPromptShownThisSession() && (() => {
        markPromptShownThisSession();
        return (
          <NotificationsPrompt
            onGranted={() => {
              notificationControl.setNotificationsEnabled?.(true);
              markNotifPromptStopped(); // success → mai più
            }}
            onDismiss={() => markNotifPromptDismissed()}
          />
        );
      })()}
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
          onOpenSearch={() => setShowSearch(true)}
        />
      )}

      <GlobalSearch
        open={showSearch}
        onClose={() => setShowSearch(false)}
        tasks={tasks}
        events={events}
        expenses={expenses}
        members={members}
        families={families}
        onSelectTask={(taskId) => {
          setActiveTab('bacheca');
          setOpenTaskId(taskId);
        }}
        onSelectEvent={(eventId) => {
          setActiveTab('agenda');
          setOpenEventId(eventId);
        }}
        onSelectExpense={() => {
          setActiveTab('spese');
        }}
      />

      <div className="tab-content">
        {activeTab === 'bacheca' && (
          <BachecaTab
            familyId={isAll ? null : activeFamily}
            families={families}
            tasks={tasks}
            members={members}
            taskAssignees={taskAssignees}
            taskMeta={taskMeta}
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
            onOpenAI={onOpenAI}
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
            onOpenAI={onOpenAI}
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
            onOpenAI={onOpenAI}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileTab
            session={session} profile={profile}
            families={families} members={members} me={me}
            tasks={tasks} events={events}
            activeFamilyId={isAll ? null : activeFamily}
            onChanged={refreshAll}
            onNewFamily={() => setShowNewFamily(true)}
            onOpenAI={onOpenAI}
            openInboxSignal={openFeedbackInboxSignal}
            notificationControl={notificationControl} />
        )}
      </div>

      {showNewFamily && (
        <NewFamilyModal
          session={session}
          profile={profile}
          onClose={() => setShowNewFamily(false)}
          onCreated={() => { refreshAll(); }}
        />
      )}

      {/* Toast reminder medicine — posizionato sopra la bottom-nav */}
      <MedicationReminderToast
        reminders={meds.pendingReminders}
        onTaken={meds.markTaken}
        onSnooze={meds.snooze}
        onSkip={meds.skip}
      />

      {/* Toast realtime: nuovi feedback ricevuti (solo admin) */}
      <FeedbackToastSubscriber
        session={session}
        onOpenInbox={() => {
          setActiveTab('profile');
          setOpenFeedbackInboxSignal((s) => s + 1);
        }}
      />

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
        hideFab={activeTab === 'agenda'}
        openSignal={aiOpenSignal}
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

function Header({ family, members, allMembers, tasks, families, activeFamily, isAll, onSwitchFamily, onNewFamily, onOpenSearch }) {
  const { t } = useT();
  const todoCount = tasks.filter((task) => task.status !== 'done').length;

  return (
    <header style={{
      padding: '10px 16px 6px',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    }}>
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FamilySwitcher
            families={families}
            activeFamily={activeFamily}
            isAll={isAll}
            onSwitch={onSwitchFamily}
            testidPrefix="header-family"
            variant="pill"
          />
        </div>
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            data-testid="header-search-btn"
            aria-label={t('search_open') || 'Cerca'}
            title={t('search_open') || 'Cerca'}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'white', border: '1px solid var(--sm)',
              color: 'var(--km)', fontSize: 16, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
            🔍
          </button>
        )}
      </div>
      <p style={{
        margin: '2px 16px 0',
        fontSize: 12, color: 'var(--km)', fontWeight: 500,
      }}>
        {isAll
          ? `${families.length} ${families.length === 1 ? t('family_one_label') : t('family_other_label')} · ${todoCount} ${t('todo_label')}`
          : `${members.length} ${members.length === 1 ? t('member_one') : t('member_other')} · ${todoCount} ${t('todo_label')}`
        }
      </p>
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
