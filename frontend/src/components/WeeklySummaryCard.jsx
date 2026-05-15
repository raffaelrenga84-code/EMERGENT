import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { aiClient } from '../lib/aiClient.js';
import { useT } from '../lib/i18n.jsx';

/**
 * WeeklySummaryCard
 * Shows an AI-generated weekly recap. Cached in localStorage for the current
 * ISO week + language so we don't spend a model call every render — but the
 * user can tap "Rigenera" to force a fresh one, and changing UI language
 * automatically pulls (or regenerates) a translated version.
 */
function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default function WeeklySummaryCard({ familyId = null, familyName = 'Famiglia', tasks = [], events = [], expenses = [], members = [] }) {
  const { t, lang } = useT();
  const [data, setData] = useState(null); // { summary, highlights }
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Difesa contro race condition: se è selezionata una singola famiglia,
  // filtriamo i task/eventi/spese/membri per family_id qui DENTRO il componente.
  // Così se il padre passa ancora la lista "All" mentre Supabase fetch è in volo,
  // il riepilogo include solo quello della famiglia attiva.
  const fTasks = familyId ? (tasks || []).filter((x) => x.family_id === familyId) : (tasks || []);
  const fEvents = familyId ? (events || []).filter((x) => x.family_id === familyId) : (events || []);
  const fExpenses = familyId ? (expenses || []).filter((x) => x.family_id === familyId) : (expenses || []);
  const fMembers = familyId ? (members || []).filter((x) => x.family_id === familyId) : (members || []);

  // "Firma" dei dati: cambia quando il numero di task o il primo id cambia.
  // Inclusa nelle dipendenze dell'effect così, dopo che Supabase finisce di
  // caricare i nuovi dati, il riepilogo si rigenera correttamente.
  const tasksSig = `${fTasks.length}:${fTasks[0]?.id || ''}`;

  const cacheKey = `fammy_weekly_summary_${familyId || 'all'}_${isoWeekKey()}_${lang}_${tasksSig}`;

  const buildPayload = () => {
    const now = new Date();
    const oneWeekAgo = new Date(now); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAhead = new Date(now); oneWeekAhead.setDate(oneWeekAhead.getDate() + 7);

    const completed = fTasks
      .filter((t) => t.status === 'done')
      .filter((t) => {
        if (!t.updated_at && !t.created_at) return true;
        const d = new Date(t.updated_at || t.created_at);
        return d >= oneWeekAgo;
      })
      .slice(0, 20)
      .map((t) => t.title);

    const pending = fTasks
      .filter((t) => t.status !== 'done')
      .slice(0, 15)
      .map((t) => t.title);

    const upcomingEvents = fEvents
      .filter((ev) => {
        const d = new Date(ev.starts_at);
        return d >= now && d <= oneWeekAhead;
      })
      .slice(0, 10)
      .map((ev) => {
        const d = new Date(ev.starts_at);
        return `${ev.title} — ${d.toLocaleDateString(lang, { day: 'numeric', month: 'short' })}`;
      });

    const totalExpenses = fExpenses
      .filter((e) => {
        if (!e.created_at) return false;
        return new Date(e.created_at) >= oneWeekAgo;
      })
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const upcomingBirthdays = fMembers
      .filter((m) => m.birth_date)
      .map((m) => {
        const today = new Date();
        const b = new Date(m.birth_date);
        const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        const days = Math.round((next - today) / 86400000);
        return { name: m.name, days, date: next };
      })
      .filter((x) => x.days <= 14)
      .sort((a, b) => a.days - b.days)
      .slice(0, 3)
      .map((x) => `${x.name} — ${x.date.toLocaleDateString(lang, { day: 'numeric', month: 'short' })}`);

    return {
      family_name: familyName,
      completed_tasks: completed,
      pending_tasks: pending,
      upcoming_events: upcomingEvents,
      total_expenses: totalExpenses || null,
      upcoming_birthdays: upcomingBirthdays,
      lang,
    };
  };

  const fetchSummary = async (force = false) => {
    setLoading(true); setErr('');
    try {
      if (!force) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            setData(JSON.parse(cached));
            setLoading(false);
            return;
          }
        } catch (e) {}
      }
      const res = await aiClient.weeklySummary(buildPayload());
      setData(res);
      try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch (e) {}
    } catch (e) {
      setErr(e.message || 'Errore');
    } finally {
      setLoading(false);
    }
  };

  // Show the card only if there's enough material to summarise (FILTERED data).
  const hasMaterial = fTasks.length > 0 || fEvents.length > 0;

  useEffect(() => {
    if (hasMaterial) {
      // Reset and refetch whenever language, family or task signature changes.
      // tasksSig change handles the race where tasks load asynchronously
      // after the user switches family.
      setData(null);
      fetchSummary(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMaterial, familyId, familyName, lang, tasksSig]);

  if (!hasMaterial) return null;

  return (
    <div className="ai-summary-card" data-testid="weekly-summary-card">
      <div className="ai-summary-top">
        <span className="ai-summary-spark"><Sparkles size={16} /></span>
        <span className="ai-summary-eyebrow">{t('weekly_summary_eyebrow')}</span>
      </div>

      {loading && !data && (
        <>
          <div className="skeleton" style={{ height: 18, width: '80%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 18, width: '95%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 18, width: '60%' }} />
        </>
      )}

      {err && !data && (
        <div style={{ fontSize: 13, color: 'var(--rd)' }}>⚠️ {err}</div>
      )}

      {data && (
        <>
          <div className="ai-summary-text" data-testid="weekly-summary-text">{data.summary}</div>
          {Array.isArray(data.highlights) && data.highlights.length > 0 && (
            <div className="ai-summary-hl">
              {data.highlights.slice(0, 4).map((h, i) => (
                <div key={i} className="ai-summary-hl-item">{h}</div>
              ))}
            </div>
          )}
          <div className="ai-summary-actions">
            <button
              className="ai-pill-btn"
              onClick={() => fetchSummary(true)}
              disabled={loading}
              data-testid="weekly-summary-refresh"
            >
              <RefreshCw size={12} /> {loading ? t('regenerating') : t('regenerate')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
