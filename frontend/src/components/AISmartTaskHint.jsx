import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { aiClient } from '../lib/aiClient.js';

/**
 * AISmartTaskHint
 * Lives inline inside AddTaskModal (step 1). When the user finishes typing a
 * task title (debounce 600ms) we call /api/ai/suggest-task and propose a
 * category + due date. Tapping "Applica" lifts the suggestion to the parent
 * via the onApply callback.
 */
const ALLOWED = ['care', 'home', 'health', 'admin', 'spese', 'other'];
const CAT_LABEL = {
  care: '❤️ Cura',
  home: '🏠 Casa',
  health: '💊 Salute',
  admin: '📋 Pratiche',
  spese: '💶 Spese',
  other: '📌 Altro',
};

function relativeLabel(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return 'oggi';
    if (diff === 1) return 'domani';
    if (diff > 1 && diff <= 7) return `tra ${diff} giorni`;
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  } catch (e) { return dateStr; }
}

export default function AISmartTaskHint({ title, onApply, currentCategory }) {
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [lastTitle, setLastTitle] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    // Reset dismiss when the title meaningfully changes
    if (title !== lastTitle && dismissed) setDismissed(false);

    if (timer.current) clearTimeout(timer.current);
    if (!title || title.trim().length < 4) {
      setSuggestion(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const today = new Date().toISOString().slice(0, 10);
        const res = await aiClient.suggestTask({ title: title.trim(), today, lang: 'it' });
        if (ALLOWED.includes(res.category)) {
          setSuggestion(res);
          setLastTitle(title);
        }
      } catch (e) {
        // silent fail — AI hint is optional
      } finally {
        setLoading(false);
      }
    }, 700);

    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  if (dismissed || !suggestion) return null;

  // If the user already matched what we suggest, don't show
  const same = suggestion.category === currentCategory && !suggestion.suggested_due_date;
  if (same) return null;

  const dueLabel = relativeLabel(suggestion.suggested_due_date);

  return (
    <div className="ai-suggestion" data-testid="ai-task-suggestion">
      <span className="ai-suggestion-icon"><Sparkles size={16} /></span>
      <div className="ai-suggestion-body">
        <div className="ai-suggestion-title">Suggerimento AI</div>
        <div className="ai-suggestion-text">
          Categoria: <strong>{CAT_LABEL[suggestion.category]}</strong>
          {dueLabel ? <> · Scadenza: <strong>{dueLabel}</strong></> : null}
        </div>
      </div>
      <div className="ai-suggestion-actions">
        <button
          className="accept"
          type="button"
          onClick={() => {
            onApply && onApply({
              category: suggestion.category,
              dueDate: suggestion.suggested_due_date || '',
            });
            setDismissed(true);
          }}
          data-testid="ai-task-suggestion-apply"
        >
          Applica
        </button>
        <button
          className="dismiss"
          type="button"
          onClick={() => setDismissed(true)}
          data-testid="ai-task-suggestion-dismiss"
          title="Ignora"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
