import { useEffect, useRef, useState } from 'react';
import { toLocalYMD } from '../lib/dateUtils.js';
import { Sparkles } from 'lucide-react';
import { aiClient } from '../lib/aiClient.js';
import { useT } from '../lib/i18n.jsx';

/**
 * AISmartTaskHint
 * Lives inline inside AddTaskModal (step 1). When the user finishes typing a
 * task title (debounce 700ms) we call /api/ai/suggest-task and propose a
 * category + due date. Tapping the apply button lifts the suggestion to the
 * parent via the onApply callback. Fully localized via the i18n context.
 */
const ALLOWED = ['care', 'home', 'health', 'admin', 'spese', 'other'];
const CAT_EMOJI = {
  care: '❤️', home: '🏠', health: '💊', admin: '📋', spese: '💶', other: '📌',
};

function relativeLabel(dateStr, t, lang) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return t('today');
    if (diff === 1) return t('tomorrow');
    if (diff > 1 && diff <= 7) return t('in_n_days').replace('{n}', diff);
    return d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  } catch (e) { return dateStr; }
}

export default function AISmartTaskHint({ title, onApply, currentCategory }) {
  const { t, lang } = useT();
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
        const today = toLocalYMD();
        const res = await aiClient.suggestTask({ title: title.trim(), today, lang });
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
  }, [title, lang]);

  if (dismissed || !suggestion) return null;

  // If the user already matched what we suggest, don't show
  const same = suggestion.category === currentCategory && !suggestion.suggested_due_date;
  if (same) return null;

  const dueLabel = relativeLabel(suggestion.suggested_due_date, t, lang);
  const catLabel = `${CAT_EMOJI[suggestion.category]} ${t(`cat_${suggestion.category}`)}`;

  return (
    <div className="ai-suggestion" data-testid="ai-task-suggestion">
      <span className="ai-suggestion-icon"><Sparkles size={16} /></span>
      <div className="ai-suggestion-body">
        <div className="ai-suggestion-title">{t('ai_suggestion_eyebrow')}</div>
        <div className="ai-suggestion-text">
          {t('category_label')}: <strong>{catLabel}</strong>
          {dueLabel ? <> · {t('due_label')}: <strong>{dueLabel}</strong></> : null}
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
          {t('apply')}
        </button>
        <button
          className="dismiss"
          type="button"
          onClick={() => setDismissed(true)}
          data-testid="ai-task-suggestion-dismiss"
          title={t('dismiss')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
