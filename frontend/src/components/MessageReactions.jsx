import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { sendPush, memberIdsToUserIds } from '../lib/pushClient.js';

const REACTIONS = ['❤️', '👍', '🎉', '😂', '😮', '🙏'];

/**
 * MessageReactions — mostra picker + bollini reaction sotto il bubble.
 *
 * Modalità:
 *  - "uncontrolled" (default): l'icona 😊 apre il picker tramite state interno
 *  - "controlled": il parent passa `pickerOpen` + `onPickerClose` per aprire
 *    il picker via long-press dal bubble.
 *
 * Props:
 *  - response: {id, reactions, author_id, text, task_id}
 *  - me: il member dell'utente loggato (per sapere chi reagisce)
 *  - members: lista membri della famiglia (per push + tooltip)
 *  - taskTitle: titolo del task (per push)
 *  - isMine: true se il bubble è mio (allinea picker e bollini a destra)
 *  - pickerOpen?: bool (controlled mode)
 *  - onPickerClose?: () => void
 */
export default function MessageReactions({
  response, me, members, taskTitle, isMine,
  pickerOpen, onPickerClose,
}) {
  const [reactions, setReactions] = useState(response?.reactions || {});
  const [internalOpen, setInternalOpen] = useState(false);
  const pickerRef = useRef(null);
  const anchorRef = useRef(null);
  // Posizione fixed del picker: calcolata all'apertura dal rect dell'anchor
  // e clampata dentro lo schermo. (Prima era position:absolute con right:-8
  // → per i messaggi degli altri si estendeva a sinistra FUORI dallo schermo
  // e veniva clippato dal contenitore scrollabile della chat.)
  const [pickerPos, setPickerPos] = useState(null);

  const isControlled = typeof pickerOpen === 'boolean';
  const open = isControlled ? pickerOpen : internalOpen;
  const close = () => {
    if (isControlled) onPickerClose?.();
    else setInternalOpen(false);
  };

  useEffect(() => {
    setReactions(response?.reactions || {});
  }, [response?.reactions]);

  useEffect(() => {
    if (!open) { setPickerPos(null); return; }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const PICKER_W = REACTIONS.length * 32 + (REACTIONS.length - 1) * 4 + 16;
    const PICKER_H = 44;
    const margin = 8;
    let left = isMine ? r.right - PICKER_W : r.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - PICKER_W - margin));
    // Sopra l'anchor; se non c'è spazio (primo messaggio in alto) → sotto.
    let top = r.top - PICKER_H - 6;
    if (top < margin) top = r.bottom + 6;
    setPickerPos({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMine]);

  // Chiudi il picker se la chat scrolla (la posizione fixed non seguirebbe)
  useEffect(() => {
    if (!open) return;
    const onScroll = () => close();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) close();
    };
    // Delay per non chiudere subito dopo il long-press che lo ha aperto
    const id = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
    }, 80);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const myMemberId = me?.id;

  const sendReactionPush = async (emoji) => {
    if (!response?.author_id || response.author_id === myMemberId) return;
    try {
      const userIds = await memberIdsToUserIds([response.author_id]);
      if (me?.user_id) userIds.delete(me.user_id);
      if (userIds.size === 0) return;
      const reactorName = (me?.name || '').split(' ')[0] || 'Qualcuno';
      sendPush({
        userIds: [...userIds],
        title: `${emoji} ${reactorName} ha reagito`,
        body: taskTitle
          ? `${taskTitle}\n"${(response.text || '').slice(0, 60)}"`
          : `"${(response.text || '').slice(0, 60)}"`,
        tag: `reaction-${response.id}`,
        data: { task_id: response.task_id, kind: 'task' },
      });
    } catch (e) { /* silent */ }
  };

  const toggle = async (emoji) => {
    if (!myMemberId || !response?.id) return;
    const before = reactions;
    const cur = Array.isArray(before[emoji]) ? before[emoji] : [];
    const hadMine = cur.includes(myMemberId);
    const next = { ...before };
    if (hadMine) {
      const arr = cur.filter((x) => x !== myMemberId);
      if (arr.length === 0) delete next[emoji];
      else next[emoji] = arr;
    } else {
      next[emoji] = [...cur, myMemberId];
    }
    setReactions(next);
    close();

    const { data, error } = await supabase.rpc('toggle_reaction', {
      p_response_id: response.id,
      p_emoji: emoji,
      p_member_id: myMemberId,
    });
    if (error) {
      console.warn('toggle_reaction failed:', error);
      setReactions(before);
      return;
    }
    if (data) setReactions(data);
    if (!hadMine) sendReactionPush(emoji);
  };

  const namesOf = (memberIds) => (memberIds || [])
    .map((id) => members?.find((m) => m.id === id)?.name?.split(' ')[0] || '?')
    .join(', ');

  const entries = Object.entries(reactions).filter(
    ([, arr]) => Array.isArray(arr) && arr.length > 0
  );

  return (
    <div ref={anchorRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bollini reactions attivi sotto il bubble */}
      {entries.length > 0 && (
        <div style={{
          display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap',
          justifyContent: isMine ? 'flex-end' : 'flex-start',
        }} data-testid="reactions-row">
          {entries.map(([emoji, memberIds]) => {
            const mine = memberIds.includes(myMemberId);
            return (
              <button key={emoji} type="button"
                onClick={() => toggle(emoji)}
                title={namesOf(memberIds)}
                data-testid={`reaction-pill-${emoji}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 8px',
                  borderRadius: 100,
                  border: mine ? '1.5px solid var(--ac)' : '1px solid var(--sm)',
                  background: mine ? 'var(--ab)' : 'white',
                  fontSize: 11, fontWeight: 600,
                  color: mine ? 'var(--ac)' : 'var(--km)',
                  cursor: 'pointer',
                  lineHeight: 1.2,
                }}>
                <span style={{ fontSize: 13 }}>{emoji}</span>
                <span>{memberIds.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Icona 😊 piccola — apre il picker (modalità uncontrolled) */}
      {!isControlled && (
        <button type="button"
          onClick={() => setInternalOpen((v) => !v)}
          aria-label="Aggiungi reazione"
          data-testid={`reaction-open-btn-${response.id}`}
          style={{
            position: 'absolute',
            top: -10,
            [isMine ? 'left' : 'right']: -8,
            width: 24, height: 24, borderRadius: '50%',
            background: 'white',
            border: '1px solid var(--sm)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
            opacity: 0.85,
          }}>
          😊
        </button>
      )}

      {/* Picker overlay — fixed, sempre dentro lo schermo, sopra il modale */}
      {open && pickerPos && (
        <div ref={pickerRef}
          data-testid={`reaction-picker-${response.id}`}
          style={{
            position: 'fixed',
            top: pickerPos.top,
            left: pickerPos.left,
            background: 'white',
            borderRadius: 100,
            padding: '6px 8px',
            border: '1px solid var(--sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex', gap: 4,
            zIndex: 300,
            animation: 'reactionPop 0.18s ease-out',
          }}>
          {REACTIONS.map((emoji) => (
            <button key={emoji} type="button"
              onClick={() => toggle(emoji)}
              data-testid={`reaction-pick-${emoji}`}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'transparent', border: 'none',
                fontSize: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
                transition: 'transform 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.25)';
                e.currentTarget.style.background = 'var(--ab)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = 'transparent';
              }}>
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { REACTIONS };
