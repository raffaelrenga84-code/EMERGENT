import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { sendPush, memberIdsToUserIds } from '../lib/pushClient.js';
import { useT } from '../lib/i18n.jsx';
import RecurringActionChoice from './RecurringActionChoice.jsx';
import DetailTabs from './DetailTabs.jsx';
import MessageReactions from './MessageReactions.jsx';

const CAT_EMOJI = {
  care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌',
};

export default function TaskDetailModal({
  task, members, me,
  onClose, onChanged, onClosed,
  onEdit,              // (task) => void  -> apre AddTaskModal in edit mode
  onOpenExpense,       // (task) => void  -> switch a Spese + apri spesa per task
}) {
  const { t } = useT();
  // Solo 3 stati cliccabili. 'taken' viene impostato automaticamente
  // quando si fa "Me ne occupo io".
  const STATUS = [
    { id: 'todo',   label: t('td_status_todo'),   color: 'var(--am)' },
    { id: 'done',   label: t('td_status_done'),   color: 'var(--gn)' },
    { id: 'to_pay', label: t('td_status_to_pay'), color: 'var(--rd)' },
  ];
  const [title] = useState(task.title);
  // Per le istanze di ricorrenze l'id è "<orig>__<date>": le mutazioni DEVONO
  // andare sull'orig id, non sul finto id.
  const realTaskId = task._origId || task.id;
  const isRecurringInstance = !!task._isRecurringInstance;
  const occurrenceDate = task._occurrenceDate || null;
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [linkedExpenses, setLinkedExpenses] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [didAutoOpen, setDidAutoOpen] = useState(false);
  // Numero di messaggi nuovi arrivati mentre il tab Chat NON è attivo.
  // Reset a 0 appena l'utente passa al tab Chat.
  const [unreadCount, setUnreadCount] = useState(0);
  // Idem per il tab Allegati (nuovi allegati / spese collegate)
  const [unreadAttach, setUnreadAttach] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showDelegate, setShowDelegate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRecurringChoice, setShowRecurringChoice] = useState(null); // 'edit' | 'delete'
  // Id del response su cui è attualmente aperto il picker emoji via long-press.
  // null = nessun picker via long-press attivo (i picker "uncontrolled" lavorano
  // con il loro internalOpen state, indipendente).
  const [longPressPickerId, setLongPressPickerId] = useState(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: commentsData } = await supabase
        .from('task_responses').select('*')
        .eq('task_id', realTaskId).order('created_at');
      if (!cancelled) {
        setComments(commentsData || []);
        // Auto-apri il tab "Chat" se ci sono già messaggi reali (non system),
        // così l'utente vede subito la conversazione invece dei dettagli.
        const hasRealMessage = (commentsData || []).some((c) => c.type !== 'system');
        if (hasRealMessage && !didAutoOpen) {
          setActiveTab('thread');
          setDidAutoOpen(true);
        }
      }

      const { data: assigneeData } = await supabase
        .from('task_assignees').select('member_id').eq('task_id', realTaskId);
      if (!cancelled) {
        const memberIds = (assigneeData || []).map((a) => a.member_id);
        setAssignees(members.filter((m) => memberIds.includes(m.id)));
      }

      // Allegati foto
      const { data: attData } = await supabase
        .from('task_attachments')
        .select('id, file_path, file_name')
        .eq('task_id', realTaskId);
      if (!cancelled) setAttachments(attData || []);
      // Signed URLs (bucket privato)
      if (attData && attData.length > 0) {
        const urls = {};
        for (const att of attData) {
          const { data: sig } = await supabase.storage
            .from('task-attachments')
            .createSignedUrl(att.file_path, 60 * 60);
          if (sig?.signedUrl) urls[att.id] = sig.signedUrl;
        }
        if (!cancelled) setPhotoUrls(urls);
      }

      // Spese collegate al task (se la tabella expenses ha la colonna task_id)
      try {
        const { data: expData } = await supabase
          .from('expenses')
          .select('id, amount, description, created_at, category')
          .eq('task_id', realTaskId)
          .order('created_at', { ascending: false });
        if (!cancelled) setLinkedExpenses(expData || []);
      } catch (e) {
        // colonna potrebbe non esistere su DB legacy: ignora
        if (!cancelled) setLinkedExpenses([]);
      }
    })();
    return () => { cancelled = true; };
  }, [task.id, members]);

  // Realtime: ascolta nuovi messaggi su questo task. Se il tab attivo non è
  // 'thread' e il messaggio non è mio né di sistema → incrementa unreadCount
  // (badge "● novità" sul tab Chat). Ascolta anche UPDATE per le reactions.
  useEffect(() => {
    if (!realTaskId) return;
    const channel = supabase
      .channel(`task-responses-${realTaskId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_responses',
        filter: `task_id=eq.${realTaskId}`,
      }, (payload) => {
        const newMsg = payload.new;
        if (!newMsg) return;
        setComments((prev) => {
          if (prev.some((c) => c.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        const isMine = me?.id && newMsg.author_id === me.id;
        const isSystem = newMsg.type === 'system';
        if (!isMine && !isSystem) {
          // Solo se NON sono già nel tab Chat lo conto come "non letto"
          setUnreadCount((n) => (activeTabRef.current === 'thread' ? 0 : n + 1));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'task_responses',
        filter: `task_id=eq.${realTaskId}`,
      }, (payload) => {
        // Update di reactions: ri-sincronizza l'array di commenti
        const upd = payload.new;
        if (!upd) return;
        setComments((prev) => prev.map((c) => c.id === upd.id ? { ...c, ...upd } : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [realTaskId, me?.id]);

  // Ref per leggere activeTab dentro il callback realtime senza re-subscribe
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Realtime: ascolta nuovi allegati e spese linkate. Badge unread su tab Allegati.
  useEffect(() => {
    if (!realTaskId) return;
    const attCh = supabase
      .channel(`task-attachments-${realTaskId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_attachments',
        filter: `task_id=eq.${realTaskId}`,
      }, (payload) => {
        const att = payload.new;
        if (!att) return;
        setAttachments((prev) => prev.some((a) => a.id === att.id) ? prev : [...prev, att]);
        const isMine = me?.id && att.uploaded_by === me.id;
        if (!isMine) {
          setUnreadAttach((n) => (activeTabRef.current === 'attach' ? 0 : n + 1));
        }
      })
      .subscribe();
    const expCh = supabase
      .channel(`task-expenses-link-${realTaskId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'expenses',
        filter: `task_id=eq.${realTaskId}`,
      }, (payload) => {
        const exp = payload.new;
        if (!exp) return;
        setLinkedExpenses((prev) => prev.some((e) => e.id === exp.id) ? prev : [...prev, exp]);
        const isMine = me?.id && exp.created_by === me.id;
        if (!isMine) {
          setUnreadAttach((n) => (activeTabRef.current === 'attach' ? 0 : n + 1));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(attCh);
      supabase.removeChannel(expCh);
    };
  }, [realTaskId, me?.id]);

  // Reset unread quando l'utente entra nel tab Allegati
  useEffect(() => {
    if (activeTab === 'attach' && unreadAttach > 0) setUnreadAttach(0);
  }, [activeTab, unreadAttach]);

  // Reset unread quando l'utente entra nel tab Chat
  useEffect(() => {
    if (activeTab === 'thread' && unreadCount > 0) setUnreadCount(0);
  }, [activeTab, unreadCount]);

  // Cambio stato: chiude il modale automaticamente
  const updateStatus = async (s) => {
    setBusy(true);
    await supabase.from('tasks').update({ status: s }).eq('id', realTaskId);
    setBusy(false);
    onChanged();
    if (s === 'to_pay' && typeof onOpenExpense === 'function') {
      onOpenExpense(task);
    }
    onClosed();
  };

  const canDelete = !task.author_id || task.author_id === me?.id;
  const isRecurring = !!(task.recurring_days && task.recurring_days.length > 0);

  const requestRemove = () => {
    // Istanza ricorrente: chiedi singola o serie
    if (isRecurringInstance && occurrenceDate) {
      setShowRecurringChoice('delete');
      return;
    }
    if (isRecurring) { setShowDeleteConfirm(true); return; }
    if (!confirm(t('td_delete_confirm'))) return;
    doDeleteAll();
  };

  const excludeSingleOccurrence = async () => {
    if (!occurrenceDate) return;
    const { data: cur } = await supabase
      .from('tasks').select('recurring_exceptions').eq('id', realTaskId).maybeSingle();
    const next = [...(cur?.recurring_exceptions || [])];
    if (!next.includes(occurrenceDate)) next.push(occurrenceDate);
    await supabase.from('tasks').update({ recurring_exceptions: next }).eq('id', realTaskId);
  };

  const onRecurringSingle = async () => {
    if (showRecurringChoice === 'delete') {
      setBusy(true);
      await excludeSingleOccurrence();
      setBusy(false);
      setShowRecurringChoice(null);
      onChanged(); onClosed();
    } else if (showRecurringChoice === 'edit') {
      setBusy(true);
      await excludeSingleOccurrence();
      setBusy(false);
      setShowRecurringChoice(null);
      // Apri editing del task (in modalità nuova istanza standalone via prefill)
      if (onEdit) onEdit({ ...task, _editAsNew: true });
    }
  };

  const onRecurringSeries = async () => {
    if (showRecurringChoice === 'delete') {
      if (!confirm('Sei sicuro di voler eliminare TUTTA la serie ricorrente?')) {
        setShowRecurringChoice(null); return;
      }
      setShowRecurringChoice(null);
      doDeleteAll();
    } else if (showRecurringChoice === 'edit') {
      setShowRecurringChoice(null);
      if (onEdit) onEdit({ ...task, id: realTaskId });
    }
  };

  const doDeleteAll = async () => {
    setBusy(true);
    await supabase.from('tasks').delete().eq('id', realTaskId);
    setBusy(false); setShowDeleteConfirm(false);
    onChanged(); onClosed();
  };

  const doStopRecurrence = async () => {
    setBusy(true);
    await supabase.from('tasks').update({
      recurring_days: null, recurring_until: null,
    }).eq('id', realTaskId);
    await supabase.from('task_responses').insert({
      task_id: realTaskId, author_id: me?.id || null,
      text: t('td_sys_recurrence_end'),
      type: 'system',
    });
    setBusy(false); setShowDeleteConfirm(false);
    onChanged(); onClosed();
  };

  const isAssigned = assignees.some((a) => a.id === me?.id);
  const isSoleAssignee = isAssigned && assignees.length === 1;
  const isCoAssignee = isAssigned && assignees.length > 1;
  const isDelegateTarget = !!(task.delegated_to && me && task.delegated_to === me.id);

  const claimOnly = async () => {
    if (!me) return;
    setBusy(true);
    const snapshot = (task.delegated_from && task.delegated_from.length > 0)
      ? task.delegated_from
      : assignees.map((a) => a.id);

    await supabase.from('task_assignees').delete().eq('task_id', realTaskId);
    await supabase.from('task_assignees').insert({ task_id: realTaskId, member_id: me.id });
    await supabase.from('tasks').update({
      status: 'taken', urgent: false, priority: 'normal',
      delegated_from: snapshot, delegated_to: null,
    }).eq('id', realTaskId);
    await supabase.from('task_responses').insert({
      task_id: realTaskId, author_id: me.id,
      text: t('td_sys_claim'), type: 'system',
    });
    setBusy(false); onChanged(); onClosed();
  };

  const delegateToMember = async (memberId) => {
    if (!me) return;
    setBusy(true);
    const baseGroup = (task.delegated_from && task.delegated_from.length > 0)
      ? task.delegated_from
      : assignees.map((a) => a.id);
    const restoreIds = baseGroup.filter((id) => id !== me.id);
    if (memberId && !restoreIds.includes(memberId)) restoreIds.push(memberId);

    await supabase.from('task_assignees').delete().eq('task_id', realTaskId);
    if (restoreIds.length > 0) {
      await supabase.from('task_assignees').insert(
        restoreIds.map((mid) => ({ task_id: realTaskId, member_id: mid }))
      );
    }
    await supabase.from('tasks').update({
      status: restoreIds.length === 0 ? 'todo' : 'taken',
      urgent: false, priority: 'medium',
      delegated_to: memberId, delegated_from: baseGroup,
    }).eq('id', realTaskId);

    const member = members.find((m) => m.id === memberId);
    await supabase.from('task_responses').insert({
      task_id: realTaskId, author_id: me.id,
      text: t('td_sys_delegated', { name: member?.name || t('td_someone') }),
      type: 'system',
    });
    setBusy(false); setShowDelegate(false);
    onChanged(); onClosed();
  };

  const refuseDelegation = async () => {
    if (!me) return;
    setBusy(true);
    await supabase.from('tasks').update({
      delegated_to: null, priority: 'normal',
    }).eq('id', realTaskId);
    await supabase.from('task_responses').insert({
      task_id: realTaskId, author_id: me.id,
      text: t('td_sys_refused'), type: 'system',
    });
    setBusy(false); onChanged(); onClosed();
  };

  const unassignMe = async () => {
    if (!me) return;
    setBusy(true);
    await supabase.from('task_assignees').delete().eq('task_id', realTaskId);

    let restoreIds = [];
    if (task.delegated_from && task.delegated_from.length > 0) {
      restoreIds = task.delegated_from.filter((id) => id !== me.id);
    } else {
      restoreIds = assignees.filter((a) => a.id !== me.id).map((a) => a.id);
    }

    if (restoreIds.length > 0) {
      await supabase.from('task_assignees').insert(
        restoreIds.map((mid) => ({ task_id: realTaskId, member_id: mid }))
      );
    }

    await supabase.from('task_responses').insert({
      task_id: realTaskId, author_id: me.id,
      text: t('td_sys_unexpected'), type: 'system',
    });

    await supabase.from('tasks').update({
      status: restoreIds.length === 0 ? 'todo' : 'taken',
      urgent: true, priority: 'high',
      delegated_from: null, delegated_to: null,
    }).eq('id', realTaskId);

    setBusy(false); onChanged(); onClosed();
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setBusy(true);
    const commentText = newComment.trim();
    await supabase.from('task_responses').insert({
      task_id: realTaskId, author_id: me?.id || null,
      text: commentText, type: 'comment',
    });
    setNewComment('');
    const { data } = await supabase.from('task_responses').select('*').eq('task_id', realTaskId).order('created_at');
    setComments(data || []);
    setBusy(false);

    // 🔔 Push: notifica gli altri membri coinvolti nella conversazione.
    // Destinatari: autore originale del task + tutti gli attuali assignees
    //              + delegated_from (chi era stato originariamente assegnato).
    // Escludi: me stesso (autore del commento).
    try {
      const recipientMemberIds = new Set();
      if (task.author_id && task.author_id !== me?.id) {
        recipientMemberIds.add(task.author_id);
      }
      for (const a of assignees) {
        if (a?.id && a.id !== me?.id) recipientMemberIds.add(a.id);
      }
      if (Array.isArray(task.delegated_from)) {
        for (const mid of task.delegated_from) {
          if (mid && mid !== me?.id) recipientMemberIds.add(mid);
        }
      }
      const userIds = await memberIdsToUserIds([...recipientMemberIds]);
      // Escludi anche il MIO user_id (nel caso fossi sia author che assegnee)
      if (me?.user_id) userIds.delete(me.user_id);
      if (userIds.size > 0) {
        const authorName = (me?.name || '').split(' ')[0] || 'Qualcuno';
        const preview = commentText.length > 80 ? commentText.slice(0, 77) + '…' : commentText;
        sendPush({
          userIds: [...userIds],
          title: `💬 ${authorName} ha scritto`,
          body: `${task.title}\n${preview}`,
          tag: `task-comment-${realTaskId}`,
          data: { task_id: realTaskId, kind: 'task' },
        });
      }
    } catch (e) { /* silent: push best-effort */ }
  };

  // BUGFIX: filtra solo i membri della stessa famiglia del task.
  // Prima `otherMembers = members.filter(m => m.id !== me?.id)` mostrava
  // anche membri di altre famiglie quando la vista era 'all', portando a
  // delegare l'incarico a persone fuori dalla famiglia di destinazione.
  const otherMembers = members.filter(
    (m) => m.id !== me?.id && m.family_id === task.family_id
  );
  const hasOriginalGroup = task.delegated_from && task.delegated_from.length > 1;

  return (
    <div className="modal-bg" onClick={onClose}>
      {showRecurringChoice && (
        <RecurringActionChoice
          action={showRecurringChoice}
          onSingle={onRecurringSingle}
          onSeries={onRecurringSeries}
          onClose={() => setShowRecurringChoice(null)}
        />
      )}

      {showDeleteConfirm && (
        <div onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: 16,
          }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 14, maxWidth: 360, width: '100%',
              padding: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🗑️</div>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>{t('td_recurring_h')}</h3>
            <p
              style={{ fontSize: 13, color: 'var(--km)', marginTop: 0 }}
              dangerouslySetInnerHTML={{ __html: t('td_recurring_p') }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <button onClick={doStopRecurrence} disabled={busy}
                style={{
                  padding: '12px 14px', borderRadius: 12,
                  border: '1.5px solid var(--ac)', background: 'white',
                  color: 'var(--ac)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                {t('td_recurring_stop')}
                <div style={{ fontSize: 11, color: 'var(--km)', fontWeight: 500, marginTop: 2 }}>
                  {t('td_recurring_stop_d')}
                </div>
              </button>
              <button onClick={doDeleteAll} disabled={busy}
                style={{
                  padding: '12px 14px', borderRadius: 12,
                  border: '1.5px solid var(--rd)', background: 'var(--rdB)',
                  color: 'var(--rd)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                {t('td_recurring_delete')}
                <div style={{ fontSize: 11, color: 'var(--km)', fontWeight: 500, marginTop: 2 }}>
                  {t('td_recurring_delete_d')}
                </div>
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={busy}
                style={{
                  padding: '10px 14px', borderRadius: 12,
                  border: '1.5px solid var(--sm)', background: 'white',
                  color: 'var(--km)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', marginTop: 4,
                }}>
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER COMPATTO: emoji + titolo + 3 icone (Modifica, Elimina, Chiudi) */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6,
        }}>
          <span style={{ fontSize: 30, flexShrink: 0, marginTop: 2 }}>{CAT_EMOJI[task.category] || '📌'}</span>
          <h2 style={{ flex: 1, margin: 0, lineHeight: 1.2 }} data-testid="task-detail-title">{title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              data-testid="task-detail-edit-icon"
              onClick={() => {
                if (isRecurringInstance && occurrenceDate) {
                  setShowRecurringChoice('edit');
                  return;
                }
                onClosed();
                if (typeof onEdit === 'function') onEdit(task);
              }}
              title={t('td_edit')}
              aria-label={t('td_edit')}
              style={iconBtnStyle}>
              ✏️
            </button>
            {canDelete && (
              <button
                type="button"
                data-testid="task-detail-delete-icon"
                onClick={requestRemove}
                disabled={busy}
                title={t('td_delete_btn')}
                aria-label={t('td_delete_btn')}
                style={{ ...iconBtnStyle, color: 'var(--rd)' }}>
                🗑
              </button>
            )}
            <button
              type="button"
              data-testid="task-detail-close-icon"
              onClick={onClose}
              title={t('td_close')}
              aria-label={t('td_close')}
              style={iconBtnStyle}>
              ✕
            </button>
          </div>
        </div>
        {task.note && <p className="modal-sub" style={{ marginTop: 0 }}>{task.note}</p>}
        {(task.due_date || task.location) && (
          <p className="modal-sub" style={{
            marginTop: 0, marginBottom: 8,
            display: 'flex', flexWrap: 'wrap', gap: '4px 12px',
            fontSize: 13, color: 'var(--km)',
          }}>
            {task.due_date && (
              <span>
                📅 {new Date(task.due_date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                {task.due_time && <span> · 🕐 {task.due_time}</span>}
              </span>
            )}
            {task.location && <span>📍 {task.location}</span>}
          </p>
        )}

        {/* Tab orizzontali: Dettagli / Chat / Allegati */}
        <DetailTabs
          tabs={[
            { id: 'details', label: t('td_tab_details') || 'Dettagli', icon: '📋' },
            { id: 'thread',  label: t('td_tab_thread')  || 'Chat',     icon: '💬', count: comments.length, dot: unreadCount > 0 },
            { id: 'attach',  label: t('td_tab_attach')  || 'Allegati', icon: '📎', count: attachments.length + linkedExpenses.length, dot: unreadAttach > 0 },
          ]}
          active={activeTab}
          onChange={setActiveTab}
          testidPrefix="task-detail-tabs"
        />

        {/* ====== TAB: DETTAGLI ====== */}
        {activeTab === 'details' && (
          <div data-testid="task-detail-pane-details">
        {isDelegateTarget && (
          <div style={{
            marginTop: 12, padding: '12px 14px',
            background: '#FFF3E0', border: '1.5px solid #F39C12',
            borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#B36E00',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 18 }}>🧡</span>
            <span style={{ flex: 1 }}>
              {t('td_delegate_banner')}
            </span>
          </div>
        )}

        {assignees.length > 0 && (
          <div style={{
            marginTop: 12, padding: 10, background: 'var(--ab)',
            borderRadius: 12, fontSize: 13,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)', marginBottom: 6, textTransform: 'uppercase' }}>
              👥 {t('td_assigned_to')} {assignees.length === 1 ? '' : `(${assignees.length})`}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {assignees.map((a) => {
                const isDelegated = task.delegated_to && a.id === task.delegated_to;
                return (
                  <span key={a.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px',
                    background: isDelegated ? '#F39C1222' : 'white',
                    border: `1px solid ${isDelegated ? '#F39C12' : 'var(--sm)'}`,
                    borderRadius: 100,
                    fontSize: 12, fontWeight: 600,
                    color: isDelegated ? '#B36E00' : 'inherit',
                  }}>
                    <MiniAvatar member={a} />
                    {a.name}
                    {isDelegated && <span title="Delegato">🧡</span>}
                  </span>
                );
              })}
            </div>
            {hasOriginalGroup && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--km)', fontStyle: 'italic' }}>
                {t('td_originally_on_n', { n: task.delegated_from.length })}
              </div>
            )}
          </div>
        )}

        {/* Azioni di assegnazione */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isDelegateTarget && (
            <>
              <button onClick={claimOnly} disabled={busy} style={primaryBtnStyle(busy)}>
                {t('td_claim')}
              </button>
              <button onClick={refuseDelegation} disabled={busy} style={secondaryBtnStyle(busy)}>
                {t('td_refuse')}
              </button>
            </>
          )}

          {!isAssigned && !isDelegateTarget && (
            <>
              <button onClick={claimOnly} disabled={busy} style={primaryBtnStyle(busy)}>
                {t('td_claim')}
              </button>
              {otherMembers.length > 0 && (
                <AssignGrid title={t('td_pick_member')} members={otherMembers} onPick={delegateToMember} busy={busy} />
              )}
            </>
          )}

          {/* Co-assegnatario: SOLO 'Me ne occupo io'. L'imprevisto compare solo dopo aver claimato. */}
          {isCoAssignee && !isDelegateTarget && (
            <>
              <button onClick={claimOnly} disabled={busy} style={primaryBtnStyle(busy)}>
                {t('td_claim_co')}
              </button>
              <div style={{
                padding: '10px 14px', background: 'var(--ab)',
                border: '1px solid var(--sm)', borderRadius: 12,
                fontSize: 12, color: 'var(--km)', textAlign: 'center',
              }}>
                {t('td_co_count', { n: assignees.length })}
              </div>
            </>
          )}

          {isSoleAssignee && !isDelegateTarget && (
            <>
              <div style={{
                padding: '12px 16px', background: 'var(--gnB)',
                border: '1.5px solid var(--gn)', borderRadius: 12,
                fontSize: 13, color: 'var(--gn)', fontWeight: 600, textAlign: 'center',
              }}>
                {t('td_responsible_banner')}
              </div>
              <button onClick={unassignMe} disabled={busy} style={dangerBtnStyle(busy)}>
                {hasOriginalGroup ? t('td_unexpected_to_all') : t('td_unexpected_delegate')}
              </button>
              <button
                onClick={() => setShowDelegate((v) => !v)}
                disabled={busy}
                style={{
                  padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--ac)',
                  background: 'white', color: 'var(--ac)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {showDelegate ? t('td_ask_cancel') : t('td_ask_someone')}
              </button>
              {showDelegate && otherMembers.length > 0 && (
                <AssignGrid title={t('td_pick_member_short')} members={otherMembers} onPick={delegateToMember} busy={busy} />
              )}
            </>
          )}
        </div>

        {/* Stato — click = chiude il modale */}
        <div style={{ marginTop: 20 }}>
          <label>{t('td_status')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STATUS.map((s) => (
              <button key={s.id} type="button" onClick={() => updateStatus(s.id)} disabled={busy}
                style={{
                  padding: '10px 16px', borderRadius: 100, border: '1.5px solid',
                  borderColor: task.status === s.id ? s.color : 'var(--sm)',
                  background: task.status === s.id ? s.color : 'white',
                  color: task.status === s.id ? 'white' : 'var(--k)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>{s.label}</button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--km)', marginTop: 6 }}>
            {t('td_status_hint')}
          </p>
        </div>
          </div>
        )}

        {/* ====== TAB: CHAT ====== */}
        {activeTab === 'thread' && (
          <div data-testid="task-detail-pane-thread">
            {/* Header chat: riepilogo "Chat con X persone" + chip avatar */}
            <div style={{
              padding: '10px 12px', marginBottom: 10,
              background: 'var(--ab)', borderRadius: 12,
              border: '1px solid var(--sm)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--ac)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>💬</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)' }}>
                  {t('td_chat_with_n') || 'Chat con'}{' '}
                  {assignees.length > 0
                    ? assignees.map((a) => a.name?.split(' ')[0]).join(', ')
                    : (otherMembers.length > 0
                        ? otherMembers.slice(0, 3).map((m) => m.name?.split(' ')[0]).join(', ')
                        : '—')}
                </div>
                {assignees.length === 0 && otherMembers.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2, fontStyle: 'italic' }}>
                    {t('td_chat_only_you') || 'Solo tu vedrai questa conversazione finché qualcuno non ti risponderà.'}
                  </div>
                )}
              </div>
              {assignees.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {assignees.slice(0, 4).map((a, idx) => (
                    <div key={a.id}
                      title={a.name}
                      style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: a.avatar_color || '#1C1611',
                        color: 'white', fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid white',
                        marginLeft: idx === 0 ? 0 : -8,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        zIndex: 4 - idx,
                      }}>
                      {a.avatar_letter || (a.name || '?').charAt(0).toUpperCase()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lista messaggi (stile chat con bubble) */}
            <div style={{
              maxHeight: 360, overflowY: 'auto', marginBottom: 10,
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '4px 2px',
            }}
              data-testid="task-chat-list">
              {comments.length === 0 && (
                <div style={{
                  padding: '32px 16px', textAlign: 'center',
                  color: 'var(--km)', fontSize: 13,
                }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
                  <div style={{ fontWeight: 600, color: 'var(--k)', marginBottom: 4 }}>
                    {t('td_no_comments')}
                  </div>
                </div>
              )}
              {comments.map((c) => {
                const author = members.find((m) => m.id === c.author_id);
                const isSystem = c.type === 'system';
                const isMine = !isSystem && me?.id && c.author_id === me.id;

                if (isSystem) {
                  return (
                    <div key={c.id} style={{
                      alignSelf: 'center', maxWidth: '85%',
                      padding: '6px 12px', borderRadius: 100,
                      background: 'var(--ab)', border: '1px solid var(--sm)',
                      fontSize: 11, color: 'var(--km)',
                      textAlign: 'center', fontStyle: 'italic',
                    }} data-testid={`task-chat-msg-system-${c.id}`}>
                      {c.text} · {new Date(c.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  );
                }

                return (
                  <div key={c.id} style={{
                    display: 'flex', gap: 8,
                    flexDirection: isMine ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                  }} data-testid={`task-chat-msg-${c.id}`}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: author?.avatar_color || '#1C1611',
                      color: 'white', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {author?.avatar_letter || (author?.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: isMine ? 'flex-end' : 'flex-start',
                      maxWidth: '75%',
                    }}>
                      <div
                        onTouchStart={() => {
                          longPressTriggeredRef.current = false;
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = setTimeout(() => {
                            longPressTriggeredRef.current = true;
                            setLongPressPickerId(c.id);
                          }, 500);
                        }}
                        onTouchEnd={() => {
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                        }}
                        onTouchMove={() => {
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setLongPressPickerId(c.id);
                        }}
                        data-testid={`task-chat-bubble-${c.id}`}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 16,
                          background: isMine ? 'var(--ac)' : 'white',
                          color: isMine ? 'white' : 'var(--k)',
                          border: isMine ? 'none' : '1px solid var(--sm)',
                          borderBottomRightRadius: isMine ? 4 : 16,
                          borderBottomLeftRadius: isMine ? 16 : 4,
                          boxShadow: '0 1px 2px rgba(28,22,17,0.06)',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          WebkitTouchCallout: 'none',
                        }}>
                        {!isMine && (
                          <div style={{
                            fontSize: 10, fontWeight: 700, marginBottom: 2,
                            color: author?.avatar_color || 'var(--ac)',
                          }}>
                            {author?.name?.split(' ')[0] || t('td_someone')}
                          </div>
                        )}
                        <div style={{ fontSize: 14, lineHeight: 1.35, wordBreak: 'break-word' }}>
                          {c.text}
                        </div>
                        <div style={{
                          fontSize: 10, opacity: 0.65, marginTop: 4,
                          textAlign: isMine ? 'right' : 'left',
                        }}>
                          {new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {/* Reactions: bollini + picker (icona 😊 sempre visibile +
                          long-press apre il picker da bubble) */}
                      <MessageReactions
                        response={c}
                        me={me}
                        members={members}
                        taskTitle={title}
                        isMine={isMine}
                        pickerOpen={longPressPickerId === c.id}
                        onPickerClose={() => setLongPressPickerId(null)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick replies (visibili sempre, sopra il composer) */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8,
            }} data-testid="task-chat-quick-replies">
              {[
                t('td_quick_reply_ok') || '👍 Tutto ok',
                t('td_quick_reply_done') || '✅ Fatto',
                t('td_quick_reply_q') || '❓ Domanda',
              ].map((qr) => (
                <button key={qr} type="button"
                  onClick={() => setNewComment((prev) => prev ? `${prev} ${qr}` : qr)}
                  data-testid={`task-chat-qr-${qr.slice(0, 8)}`}
                  style={{
                    padding: '6px 12px', borderRadius: 100,
                    border: '1px solid var(--sm)', background: 'white',
                    color: 'var(--km)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  {qr}
                </button>
              ))}
            </div>

            {/* Composer chat: input rounded + bottone send circolare */}
            <div style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '8px 10px',
              background: 'white', border: '1.5px solid var(--sm)',
              borderRadius: 100,
              boxShadow: '0 2px 6px rgba(28,22,17,0.04)',
            }}>
              <input
                style={{
                  flex: 1, border: 'none', outline: 'none',
                  background: 'transparent',
                  fontSize: 14, padding: '6px 8px',
                  color: 'var(--k)',
                }}
                placeholder={t('td_comment_ph')}
                value={newComment} onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }}
                data-testid="task-comment-input" />
              <button
                type="button"
                onClick={addComment}
                disabled={busy || !newComment.trim()}
                data-testid="task-comment-send"
                aria-label={t('td_send')}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  border: 'none',
                  background: newComment.trim() ? 'var(--ac)' : 'var(--sm)',
                  color: 'white', fontSize: 16,
                  cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s ease',
                }}>
                ➤
              </button>
            </div>
          </div>
        )}

        {/* ====== TAB: ALLEGATI & SPESE ====== */}
        {activeTab === 'attach' && (
          <div data-testid="task-detail-pane-attach">
            {/* Foto */}
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--km)',
                textTransform: 'uppercase', marginBottom: 8,
              }}>
                📸 {t('td_attach_photos') || 'Foto'} {attachments.length > 0 ? `(${attachments.length})` : ''}
              </div>
              {attachments.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--km)', fontStyle: 'italic', padding: '12px 0' }}>
                  {t('td_no_attachments') || 'Nessuna foto allegata'}
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                  gap: 8,
                }}>
                  {attachments.map((att) => (
                    <button key={att.id} type="button"
                      onClick={() => setLightbox(photoUrls[att.id])}
                      data-testid={`task-photo-${att.id}`}
                      style={{
                        aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
                        border: '1px solid var(--sm)', padding: 0,
                        background: 'var(--ab)', cursor: 'zoom-in',
                      }}>
                      {photoUrls[att.id] ? (
                        <img src={photoUrls[att.id]} alt={att.file_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{
                          width: '100%', height: '100%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 22,
                        }}>🖼️</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Spese collegate */}
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--km)',
                textTransform: 'uppercase', marginBottom: 8,
              }}>
                💶 {t('td_attach_expenses') || 'Spese collegate'} {linkedExpenses.length > 0 ? `(${linkedExpenses.length})` : ''}
              </div>
              {linkedExpenses.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--km)', fontStyle: 'italic', padding: '12px 0' }}>
                  {t('td_no_linked_expenses') || 'Nessuna spesa collegata'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {linkedExpenses.map((ex) => (
                    <div key={ex.id} className="card"
                      data-testid={`task-expense-${ex.id}`}
                      style={{
                        padding: 10, display: 'flex', alignItems: 'center',
                        gap: 10, fontSize: 13,
                      }}>
                      <span style={{ fontSize: 20 }}>💶</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>
                          {ex.description || t('td_expense_untitled') || 'Spesa'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--km)' }}>
                          {new Date(ex.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          {ex.category && <span> · {ex.category}</span>}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--ac)' }}>
                        € {Number(ex.amount || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightbox && (
          <div onClick={() => setLightbox(null)} data-testid="task-photo-lightbox"
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
              zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16, cursor: 'zoom-out',
            }}>
            <img src={lightbox} alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
          </div>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle = {
  width: 36, height: 36, borderRadius: 10,
  border: '1px solid var(--sm)', background: 'white',
  fontSize: 16, cursor: 'pointer', padding: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s ease',
};

function primaryBtnStyle(busy) {
  return {
    padding: '12px 16px', borderRadius: 12, border: 'none',
    background: 'var(--tc)', color: 'white',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 6, opacity: busy ? 0.6 : 1,
  };
}

function secondaryBtnStyle(busy) {
  return {
    padding: '12px 16px', borderRadius: 12,
    border: '1.5px solid var(--sm)', background: 'white',
    color: 'var(--km)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', opacity: busy ? 0.6 : 1,
  };
}

function dangerBtnStyle(busy) {
  return {
    padding: '12px 16px', borderRadius: 12,
    border: '1.5px solid #F5C6C3', background: 'var(--rdB)',
    color: 'var(--rd)', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', opacity: busy ? 0.6 : 1,
  };
}

function MiniAvatar({ member }) {
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 5,
      background: member.avatar_color || '#1C1611',
      color: 'white', fontSize: 10, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{member.avatar_letter || (member.name || '?').charAt(0).toUpperCase()}</span>
  );
}

function AssignGrid({ title, members, onPick, busy }) {
  return (
    <div style={{
      background: 'var(--ab)', border: '1.5px solid #B5D4F4',
      borderRadius: 12, padding: 12,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--ac)',
        letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 10,
      }}>{title}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {members.slice(0, 8).map((m) => (
          <button key={m.id} onClick={() => onPick(m.id)} disabled={busy}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 6, padding: '10px 12px', background: 'white',
              border: '1.5px solid var(--sm)', borderRadius: 12,
              cursor: 'pointer', opacity: busy ? 0.6 : 1,
            }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: m.avatar_color || '#1C1611', color: 'white',
              fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{m.avatar_letter || (m.name || '?').charAt(0).toUpperCase()}</div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--k)' }}>
              {(m.name || '').split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
