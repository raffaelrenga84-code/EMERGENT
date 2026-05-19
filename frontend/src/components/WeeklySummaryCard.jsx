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

export default function WeeklySummaryCard({ familyId = null, familyName = 'Famiglia', tasks = [], events = [], expenses = [], members = [], lazy = false }) {
  const { t, lang } = useT();
  const [data, setData] = useState(null); // { summary, highlights }
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // Quando `lazy` è true il render iniziale è una "shell" che invita l'utente
  // a cliccare "Genera ora": non sprechiamo chiamate LLM finché l'utente non
  // lo richiede esplicitamente (es. nella sezione Insights del Profilo).
  const [primed, setPrimed] = useState(!lazy);
  // Collapse state: dopo ~10s di "data caricato" la card si riduce a una barra
  // compatta, così il resto della Bacheca (task elenchi) non è sepolto.
  // L'utente può ri-aprirla con un tap. Lo stato è persistito per famiglia+settimana.
  const collapseKey = `fammy_weekly_collapsed_${familyId || 'all'}_${isoWeekKey()}_${lang}`;
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(collapseKey) === '1'; } catch (e) { return false; }
  });
  const setAndPersistCollapsed = (v) => {
    setCollapsed(v);
    try { localStorage.setItem(collapseKey, v ? '1' : '0'); } catch (e) {}
  };

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
      // Mappa errori comuni in messaggi friendly (no raw JSON all'utente)
      const raw = (e?.message || '').toLowerCase();
      let friendly = t('ai_err_generic') || 'Non sono riuscito a generare il riepilogo. Riprova tra poco.';
      if (raw.includes('503') || raw.includes('unavailable') || raw.includes('overloaded') || raw.includes('high demand')) {
        friendly = t('ai_err_busy') || 'L\'AI è sovraccarica in questo momento. Riprova tra qualche istante.';
      } else if (raw.includes('429') || raw.includes('rate') || raw.includes('quota')) {
        friendly = t('ai_err_quota') || 'Hai raggiunto il limite gratuito di richieste AI. Riprova più tardi.';
      } else if (raw.includes('network') || raw.includes('fetch') || raw.includes('failed to')) {
        friendly = t('ai_err_network') || 'Sembra che la connessione sia instabile. Controlla internet e riprova.';
      }
      setErr(friendly);
    } finally {
      setLoading(false);
    }
  };

  // Show the card only if there's enough material to summarise (FILTERED data).
  const hasMaterial = fTasks.length > 0 || fEvents.length > 0;

  useEffect(() => {
    if (!primed) return; // lazy: aspetta il click "Genera ora"
    if (hasMaterial) {
      // Reset and refetch whenever language, family or task signature changes.
      // tasksSig change handles the race where tasks load asynchronously
      // after the user switches family.
      setData(null);
      fetchSummary(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primed, hasMaterial, familyId, familyName, lang, tasksSig]);

  // Auto-collapse 10 secondi dopo che i dati arrivano (solo se l'utente
  // non l'ha già toccato esplicitamente in questa settimana).
  useEffect(() => {
    if (!data || collapsed) return;
    let collapsedManually = false;
    try { collapsedManually = localStorage.getItem(collapseKey) !== null; } catch (e) {}
    if (collapsedManually) return;
    const tid = setTimeout(() => setAndPersistCollapsed(true), 10000);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, collapseKey]);

  if (!hasMaterial) return null;

  // === LAZY SHELL VIEW ===
  // Quando `lazy=true` e l'utente non ha ancora chiesto la generazione,
  // mostriamo un placeholder che invita al tap (zero costo LLM).
  if (lazy && !primed && !data) {
    return (
      <div className="ai-summary-card" data-testid="weekly-summary-lazy">
        <div className="ai-summary-top">
          <span className="ai-summary-spark"><Sparkles size={18} /></span>
          <div className="ai-summary-eyebrow">{t('weekly_summary_eyebrow')}</div>
        </div>
        <p style={{
          margin: '8px 0 14px', fontSize: 14, color: 'var(--km)',
          fontFamily: 'var(--fs)', lineHeight: 1.5,
        }}>
          {t('weekly_summary_lazy_hint') || 'Genera un riepilogo settimanale con AI: cosa è stato fatto, cosa ancora resta, eventi e compleanni in arrivo.'}
        </p>
        <button
          type="button"
          data-testid="weekly-summary-generate-btn"
          onClick={() => setPrimed(true)}
          style={{
            padding: '10px 18px', borderRadius: 100,
            border: 'none', background: 'var(--ac)',
            color: 'white', fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          <Sparkles size={14} /> {t('weekly_summary_generate') || 'Genera ora'}
        </button>
      </div>
    );
  }

  // === COLLAPSED VIEW ===
  // Barra compatta: eyebrow + prima frase del summary (60 chars) + bottone expand
  if (data && collapsed) {
    const firstSentence = (data.summary || '').split(/[.!?]/)[0].slice(0, 70);
    return (
      <button
        type="button"
        className="ai-summary-card"
        data-testid="weekly-summary-collapsed"
        onClick={() => setAndPersistCollapsed(false)}
        style={{
          width: 'calc(100% - 32px)',
          textAlign: 'left',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          border: 'none',
        }}>
        <span className="ai-summary-spark" style={{ flexShrink: 0 }}><Sparkles size={16} /></span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <span style={{
            display: 'block', fontSize: 10, fontWeight: 700,
            color: 'var(--ac)', letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            {t('weekly_summary_eyebrow')}
          </span>
          <span style={{
            display: 'block', fontFamily: 'var(--fs)', fontSize: 13,
            color: 'var(--km)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginTop: 2,
          }}>
            {firstSentence}{firstSentence.length >= 70 ? '…' : ''}
          </span>
        </span>
        <span style={{
          flexShrink: 0, fontSize: 18, color: 'var(--km)', transform: 'rotate(180deg)',
        }}>›</span>
      </button>
    );
  }

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
        <div data-testid="weekly-summary-error">
          <div style={{ fontSize: 13, color: 'var(--rd)', marginBottom: 10, lineHeight: 1.45 }}>⚠️ {err}</div>
          <button
            className="ai-pill-btn"
            onClick={() => fetchSummary(true)}
            disabled={loading}
            data-testid="weekly-summary-retry"
          >
            <RefreshCw size={12} /> {loading ? t('regenerating') : (t('retry') || 'Riprova')}
          </button>
        </div>
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
            <button
              className="ai-pill-btn"
              onClick={() => setAndPersistCollapsed(true)}
              data-testid="weekly-summary-collapse"
              title="Riduci"
            >
              ⌃ {t('collapse_label') || 'Riduci'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
