import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * Checklist/subtask di un task. Mount nel tab "Dettagli" del TaskDetailModal.
 *
 * Features:
 * - Lista compatta di voci con checkbox + testo
 * - Inline edit (tap sul testo per modificare)
 * - + Aggiungi voce (input in fondo + Enter)
 * - Riordino con frecce ↑↓ (per semplicità — drag&drop più avanti)
 * - Delete con × on hover
 * - Realtime: vedi i tick degli altri in diretta
 *
 * Props:
 *   taskId: uuid
 *   me: { id, name } member corrente
 *   onCountsChange?: ({ total, done }) => void — per badge nella card
 */
export default function SubtaskList({ taskId, me, onCountsChange }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef(null);

  // Load iniziale + realtime subscribe
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('task_subtasks')
        .select('*')
        .eq('task_id', taskId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true });
      if (!cancelled) setItems(data || []);
    })();

    const ch = supabase
      .channel(`subtasks-${taskId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_subtasks', filter: `task_id=eq.${taskId}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === 'INSERT') {
              if (prev.some((p) => p.id === payload.new.id)) return prev;
              return [...prev, payload.new].sort((a, b) =>
                (a.order_index - b.order_index) || (a.created_at > b.created_at ? 1 : -1));
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((p) => p.id === payload.new.id ? payload.new : p);
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((p) => p.id !== payload.old.id);
            }
            return prev;
          });
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [taskId]);

  // Notifica al parent i contatori (per badge "3/5 fatti" nella card)
  useEffect(() => {
    if (typeof onCountsChange === 'function') {
      onCountsChange({ total: items.length, done: items.filter((i) => i.done).length });
    }
  }, [items, onCountsChange]);

  const addItem = async () => {
    const raw = newText.trim();
    if (!raw || busy) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      alert(t('offline_warn') || "⚠️ Nessuna connessione: l'azione non è stata salvata. Riprova quando sei online.");
      return;
    }
    setBusy(true);
    // Aggiunta multipla: "latte, pane, uova" (o testo su più righe)
    // crea una voce per ciascun elemento, in un solo invio.
    const parts = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 50);
    let nextOrder = (items.reduce((m, i) => Math.max(m, i.order_index || 0), 0)) + 1;
    const rows = parts.map((text) => ({ task_id: taskId, text, order_index: nextOrder++ }));
    const { data, error } = await supabase
      .from('task_subtasks')
      .insert(rows)
      .select();
    if (!error && data?.length) {
      // Aggiunta optimistic se la realtime non ha già fatto in tempo
      setItems((prev) => {
        const fresh = data.filter((d) => !prev.some((p) => p.id === d.id));
        return [...prev, ...fresh];
      });
      setNewText('');
      // Riposiziona focus per inserimenti rapidi
      inputRef.current?.focus();
    }
    setBusy(false);
  };

  const toggleDone = async (item) => {
    const next = !item.done;
    const patch = {
      done: next,
      completed_at: next ? new Date().toISOString() : null,
      completed_by: next ? (me?.id || null) : null,
      completed_by_name: next ? (me?.name || null) : null,
    };
    // Optimistic
    setItems((prev) => prev.map((p) => p.id === item.id ? { ...p, ...patch } : p));
    await supabase.from('task_subtasks').update(patch).eq('id', item.id);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const commitEdit = async () => {
    if (!editingId) return;
    const text = editText.trim();
    if (!text) { setEditingId(null); return; }
    setItems((prev) => prev.map((p) => p.id === editingId ? { ...p, text } : p));
    await supabase.from('task_subtasks').update({ text }).eq('id', editingId);
    setEditingId(null);
  };

  const removeItem = async (item) => {
    if (!confirm(t('subtask_delete_confirm') || 'Eliminare questa voce?')) return;
    setItems((prev) => prev.filter((p) => p.id !== item.id));
    await supabase.from('task_subtasks').delete().eq('id', item.id);
  };

  const moveItem = async (item, direction) => {
    const idx = items.findIndex((p) => p.id === item.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx];
    const b = items[swapIdx];
    // Optimistic swap
    setItems((prev) => {
      const next = [...prev];
      next[idx] = b; next[swapIdx] = a;
      return next;
    });
    await Promise.all([
      supabase.from('task_subtasks').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('task_subtasks').update({ order_index: a.order_index }).eq('id', b.id),
    ]);
  };

  const total = items.length;
  const doneN = items.filter((i) => i.done).length;
  const progressPct = total === 0 ? 0 : Math.round((doneN / total) * 100);

  return (
    <div data-testid="subtask-list" style={{
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header con progress */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)' }}>
          ✓ {t('subtask_h') || 'Checklist'}
        </div>
        {total > 0 && (
          <div style={{ fontSize: 12, color: 'var(--km)', fontWeight: 600 }}>
            {doneN}/{total} · {progressPct}%
          </div>
        )}
      </div>

      {/* Barra di progresso */}
      {total > 0 && (
        <div style={{
          height: 6, background: 'var(--sm)', borderRadius: 100, overflow: 'hidden',
        }}>
          <div style={{
            width: `${progressPct}%`, height: '100%',
            background: progressPct === 100 ? 'var(--gn)' : 'var(--ac)',
            transition: 'width 250ms ease',
          }} />
        </div>
      )}

      {/* Lista voci: le cose ancora da fare in alto, le fatte in fondo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...items].sort((a, b) =>
          ((a.done ? 1 : 0) - (b.done ? 1 : 0)) ||
          ((a.order_index || 0) - (b.order_index || 0))
        ).map((item, idx) => (
          <SubtaskRow key={item.id}
            item={item}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            isEditing={editingId === item.id}
            editText={editText}
            setEditText={setEditText}
            commitEdit={commitEdit}
            startEdit={startEdit}
            toggleDone={toggleDone}
            removeItem={removeItem}
            moveItem={moveItem}
            t={t}
          />
        ))}
        {items.length === 0 && (
          <div style={{
            fontSize: 12, color: 'var(--km)', fontStyle: 'italic',
            padding: '8px 4px', textAlign: 'center',
          }}>
            {t('subtask_empty') || 'Nessuna voce. Aggiungine una qui sotto.'}
          </div>
        )}
      </div>

      {/* Input nuova voce */}
      <div style={{
        display: 'flex', gap: 6, alignItems: 'center',
        padding: '6px 8px',
        border: '1.5px dashed var(--sm)', borderRadius: 12,
      }}>
        <span style={{ fontSize: 14, color: 'var(--km)' }}>+</span>
        <input
          ref={inputRef}
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          placeholder={t('subtask_add_ph2') || 'Aggiungi voci (anche: latte, pane, uova) + Invio'}
          data-testid="subtask-new-input"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: 'var(--k)', padding: '4px 0',
          }}
        />
        {newText.trim() && (
          <button type="button" onClick={addItem} disabled={busy}
            data-testid="subtask-add-btn"
            style={{
              padding: '4px 10px', borderRadius: 100, border: 'none',
              background: 'var(--ac)', color: 'white',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
            {t('save') || 'Salva'}
          </button>
        )}
      </div>
    </div>
  );
}

function SubtaskRow({ item, isFirst, isLast, isEditing, editText, setEditText, commitEdit, startEdit, toggleDone, removeItem, moveItem, t }) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      data-testid={`subtask-row-${item.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 10,
        background: item.done ? 'var(--ab)' : 'white',
        border: '1px solid var(--sm)',
        opacity: item.done ? 0.7 : 1,
      }}>
      {/* Checkbox custom */}
      <button type="button" onClick={() => toggleDone(item)}
        data-testid={`subtask-toggle-${item.id}`}
        aria-label={item.done ? 'Marca come da fare' : 'Marca come fatto'}
        style={{
          width: 22, height: 22, borderRadius: 6,
          border: `1.5px solid ${item.done ? 'var(--gn)' : 'var(--sd)'}`,
          background: item.done ? 'var(--gn)' : 'white',
          color: 'white', fontSize: 13, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, cursor: 'pointer', padding: 0,
          transition: 'all 150ms ease',
        }}>
        {item.done ? '✓' : ''}
      </button>

      {/* Testo: edit inline o display */}
      {isEditing ? (
        <input
          autoFocus
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') { e.preventDefault(); commitEdit(); }
          }}
          data-testid={`subtask-edit-input-${item.id}`}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: 'var(--k)', padding: 0,
          }}
        />
      ) : (
        <div
          onClick={() => !item.done && startEdit(item)}
          style={{
            flex: 1, fontSize: 13,
            color: item.done ? 'var(--km)' : 'var(--k)',
            textDecoration: item.done ? 'line-through' : 'none',
            cursor: item.done ? 'default' : 'text',
            wordBreak: 'break-word',
          }}>
          {item.text}
          {item.done && item.completed_by_name && (
            <span style={{ fontSize: 11, color: 'var(--km)', marginLeft: 6 }}>
              · {item.completed_by_name}
            </span>
          )}
        </div>
      )}

      {/* Actions (mobile = sempre visibili, desktop = on hover) */}
      <div style={{
        display: 'flex', gap: 2,
        opacity: showActions ? 1 : 0,
        transition: 'opacity 150ms ease',
        pointerEvents: showActions ? 'auto' : 'none',
      }} className="subtask-actions">
        {!isFirst && (
          <ActionBtn onClick={() => moveItem(item, 'up')} testid={`subtask-up-${item.id}`} title="Su" label="↑" />
        )}
        {!isLast && (
          <ActionBtn onClick={() => moveItem(item, 'down')} testid={`subtask-down-${item.id}`} title="Giù" label="↓" />
        )}
        <ActionBtn onClick={() => removeItem(item)} testid={`subtask-del-${item.id}`} title="Elimina" label="×" danger />
      </div>

      {/* CSS inline per forzare visibili su touch (mobile) */}
      <style>{`
        @media (hover: none) {
          [data-testid="subtask-row-${item.id}"] .subtask-actions { opacity: 1 !important; pointer-events: auto !important; }
        }
      `}</style>
    </div>
  );
}

function ActionBtn({ onClick, testid, title, label, danger }) {
  return (
    <button type="button" onClick={onClick} title={title} data-testid={testid}
      style={{
        width: 26, height: 26, borderRadius: 6, border: 'none',
        background: 'transparent', color: danger ? 'var(--rd)' : 'var(--km)',
        fontSize: 14, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {label}
    </button>
  );
}
