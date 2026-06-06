import { useEffect, useState, useMemo, useRef } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * Ricerca globale cross-tab: task, eventi, spese.
 *
 * Modal full-screen che si apre da un'icona 🔍 nell'header.
 * Filtra client-side i dati già caricati in HomeScreen (no extra fetch).
 *
 * Props:
 *  open: bool — visibilità del modal
 *  onClose: () => void
 *  tasks, events, expenses: array delle entità
 *  members, families: per risolvere nomi/etichette
 *  onSelectTask: (taskId) => void — apre TaskDetailModal
 *  onSelectEvent: (eventId) => void — apre EventDetailModal
 *  onSelectExpense: (expenseId) => void — porta a Spese (tab)
 */
export default function GlobalSearch({
  open, onClose,
  tasks = [], events = [], expenses = [],
  members = [], families = [],
  onSelectTask, onSelectEvent, onSelectExpense,
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  // Autofocus all'apertura
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Mappa famiglie e membri per veloce lookup
  const familyName = useMemo(() => {
    const map = new Map();
    for (const f of families) map.set(f.id, f.name || '');
    return map;
  }, [families]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { tasks: [], events: [], expenses: [], total: 0 };

    const matchTask = tasks.filter((tk) =>
      (tk.title || '').toLowerCase().includes(q)
      || (tk.note || '').toLowerCase().includes(q)
    ).slice(0, 10);

    const matchEvent = events.filter((ev) =>
      (ev.title || '').toLowerCase().includes(q)
      || (ev.location || '').toLowerCase().includes(q)
      || (ev.notes || '').toLowerCase().includes(q)
    ).slice(0, 10);

    const matchExpense = expenses.filter((ex) =>
      (ex.description || '').toLowerCase().includes(q)
      || String(ex.amount || '').includes(q)
    ).slice(0, 10);

    return {
      tasks: matchTask, events: matchEvent, expenses: matchExpense,
      total: matchTask.length + matchEvent.length + matchExpense.length,
    };
  }, [query, tasks, events, expenses]);

  if (!open) return null;

  return (
    <div className="modal-bg" data-testid="global-search-modal" style={{
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        background: 'white',
        maxWidth: 720, width: '92%',
        margin: 'auto', padding: 16, borderRadius: 16,
        maxHeight: '85vh', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* Header con input search */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px',
            background: 'var(--ab)', border: '1.5px solid var(--sm)',
            borderRadius: 100,
          }}>
            <span style={{ fontSize: 16, color: 'var(--km)' }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
              placeholder={t('search_placeholder') || 'Cerca incarichi, eventi, spese…'}
              data-testid="global-search-input"
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 15, color: 'var(--k)',
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}
                data-testid="global-search-clear"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 16, color: 'var(--km)', padding: 0,
                }}>×</button>
            )}
          </div>
          <button type="button" onClick={onClose}
            data-testid="global-search-close"
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: '1px solid var(--sm)', background: 'white',
              cursor: 'pointer', fontSize: 14, color: 'var(--km)',
            }}>✕</button>
        </div>

        {/* Empty state (nessuna query) */}
        {!query.trim() && (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: 'var(--km)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {t('search_intro_h') || 'Cerca in tutta FAMMY'}
            </div>
            <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              {t('search_intro_p') || 'Trova rapidamente incarichi, eventi e spese in tutte le tue famiglie.'}
            </div>
          </div>
        )}

        {/* Risultati */}
        {query.trim() && results.total === 0 && (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: 'var(--km)', fontSize: 13,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤷</div>
            {t('search_no_results') || 'Nessun risultato per'} <strong>"{query}"</strong>
          </div>
        )}

        {query.trim() && results.total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {results.tasks.length > 0 && (
              <ResultSection
                title={`📌 ${t('search_section_tasks') || 'Incarichi'}`}
                items={results.tasks}
                renderItem={(tk) => (
                  <ResultRow key={tk.id}
                    testid={`search-task-${tk.id}`}
                    title={tk.title}
                    subtitle={`${familyName.get(tk.family_id) || ''}${tk.due_date ? ` · ${formatDate(tk.due_date)}` : ''}`}
                    icon={tk.status === 'done' ? '✅' : tk.urgent ? '🔴' : '📌'}
                    onClick={() => { onSelectTask?.(tk.id); onClose(); }}
                  />
                )}
              />
            )}
            {results.events.length > 0 && (
              <ResultSection
                title={`📅 ${t('search_section_events') || 'Eventi'}`}
                items={results.events}
                renderItem={(ev) => (
                  <ResultRow key={ev.id}
                    testid={`search-event-${ev.id}`}
                    title={ev.title}
                    subtitle={`${familyName.get(ev.family_id) || ''} · ${ev.starts_at ? formatDateTime(ev.starts_at) : ''}${ev.location ? ' · 📍 ' + ev.location : ''}`}
                    icon="📅"
                    onClick={() => { onSelectEvent?.(ev.id); onClose(); }}
                  />
                )}
              />
            )}
            {results.expenses.length > 0 && (
              <ResultSection
                title={`💶 ${t('search_section_expenses') || 'Spese'}`}
                items={results.expenses}
                renderItem={(ex) => (
                  <ResultRow key={ex.id}
                    testid={`search-expense-${ex.id}`}
                    title={ex.description || (t('expenses_no_descr') || 'Spesa')}
                    subtitle={`${familyName.get(ex.family_id) || ''}${ex.paid_at ? ' · ' + formatDate(ex.paid_at) : ''}`}
                    icon="💶"
                    rightLabel={`€${Number(ex.amount || 0).toFixed(2)}`}
                    onClick={() => { onSelectExpense?.(ex.id); onClose(); }}
                  />
                )}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSection({ title, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 800, color: 'var(--km)',
        textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.05em',
      }}>{title} · {items.length}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(renderItem)}
      </div>
    </div>
  );
}

function ResultRow({ title, subtitle, icon, rightLabel, onClick, testid }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 10,
        background: 'var(--ab)', border: '1px solid var(--sm)',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'background 150ms ease',
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--s)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--ab)'}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </div>
        )}
      </div>
      {rightLabel && (
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--k)', flexShrink: 0 }}>
          {rightLabel}
        </div>
      )}
    </button>
  );
}

function formatDate(d) {
  try { return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  catch { return ''; }
}
function formatDateTime(d) {
  try { return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
