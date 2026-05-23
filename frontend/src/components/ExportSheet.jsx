import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import { downloadIcs } from '../lib/icsExport.js';

/**
 * ExportSheet — bottom-sheet per esportare il calendario su iPhone o Google.
 *
 * Props:
 *  - open: bool
 *  - onClose: () => void
 *  - families: array famiglie utente
 *  - isAll: bool — se siamo in "Tutte le famiglie"
 *  - targetFamily: oggetto famiglia attiva (se !isAll)
 *  - events, tasks, filterEvent, filterTask: già filtrati dal contesto agenda
 */
export default function ExportSheet({
  open, onClose, families = [], isAll = false, targetFamily = null,
  events = [], tasks = [], filterEvent, filterTask,
}) {
  const { t } = useT();
  // Default: NESSUNA famiglia selezionata. L'utente sceglie esplicitamente
  // cosa esportare, evitando export massivi indesiderati.
  const [selectedFamilies, setSelectedFamilies] = useState([]);

  if (!open) return null;

  const toggleFamily = (fid) => {
    if (selectedFamilies.includes(fid)) {
      setSelectedFamilies((prev) => prev.filter((x) => x !== fid));
    } else {
      setSelectedFamilies((prev) => [...prev, fid]);
    }
  };

  const setAll = () => setSelectedFamilies(families.map((f) => f.id));
  const clearAll = () => setSelectedFamilies([]);

  const handleExport = (provider) => {
    const allowedFamilyIds = isAll && selectedFamilies.length < families.length
      ? new Set(selectedFamilies)
      : null;

    const visibleEvents = (events || []).filter((e) => {
      if (allowedFamilyIds && !allowedFamilyIds.has(e.family_id)) return false;
      return filterEvent ? filterEvent({ ...e }) : true;
    });
    const visibleTasks = (tasks || []).filter((tk) => {
      if (!tk.due_date) return false;
      if (allowedFamilyIds && !allowedFamilyIds.has(tk.family_id)) return false;
      return filterTask ? filterTask(tk) : true;
    });

    let cn;
    if (isAll) {
      if (allowedFamilyIds && allowedFamilyIds.size < families.length) {
        const picked = families.filter((f) => allowedFamilyIds.has(f.id)).map((f) => f.name);
        cn = `FAMMY · ${picked.join(' + ')}`;
      } else {
        cn = 'FAMMY · Tutte le famiglie';
      }
    } else {
      cn = `FAMMY · ${targetFamily?.name || 'Agenda'}`;
    }
    const baseName = (isAll ? 'tutte' : (targetFamily?.name || 'agenda'))
      .toLowerCase().replace(/\s+/g, '-');
    const filename = `fammy-${baseName}.ics`;

    downloadIcs({ events: visibleEvents, tasks: visibleTasks, calName: cn, filename });
    try { localStorage.setItem('fammy_exported_ics', '1'); } catch (e) { /* storage pieno */ }

    if (provider === 'google') {
      window.setTimeout(() => {
        window.open('https://calendar.google.com/calendar/u/0/r/settings/export', '_blank', 'noopener,noreferrer');
      }, 600);
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: {
          text: t('export_toast_google') || '📅 File scaricato',
          tone: 'info',
        },
      }));
    } else {
      window.dispatchEvent(new CustomEvent('fammy_toast', {
        detail: {
          text: t('export_toast_apple') || '📲 Calendario scaricato',
          tone: 'success',
        },
      }));
    }
    onClose();
  };

  const canExport = !isAll || selectedFamilies.length > 0;
  const disabledReason = !canExport ? (t('export_pick_at_least_one') || 'Seleziona almeno una famiglia') : '';

  return (
    <div
      data-testid="export-sheet-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        background: 'rgba(28,22,17,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="export-sheet"
        style={{
          width: '100%', maxWidth: 520,
          background: 'white',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: 12,
          animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
          maxHeight: '88vh', overflowY: 'auto',
        }}>
        <div style={{
          width: 40, height: 4, borderRadius: 4, background: 'var(--sm)',
          margin: '0 auto 4px',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            📥 {t('export_sheet_title') || 'Esporta calendario'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="export-sheet-close"
            aria-label="Chiudi"
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: 'none', background: 'var(--ab)',
              color: 'var(--km)', fontSize: 16,
              cursor: 'pointer',
            }}>✕</button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: 'var(--km)', lineHeight: 1.45 }}>
          {t('export_sheet_subtitle') || 'Scarica un file .ics e importalo nel tuo calendario preferito.'}
        </p>

        {/* Picker famiglie (solo in modalità Tutte) */}
        {isAll && families.length > 1 && (
          <div
            data-testid="export-families-picker"
            style={{
              padding: '10px 12px',
              background: 'var(--ab)',
              border: '1px solid var(--sm)',
              borderRadius: 12,
            }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--km)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>📦 {t('export_pick_families') || 'Famiglie da esportare'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedFamilies.length < families.length && (
                  <button type="button" onClick={setAll}
                    data-testid="export-families-all"
                    style={{
                      background: 'transparent', border: 'none', padding: 0,
                      color: 'var(--ac)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      textTransform: 'none', letterSpacing: 0,
                    }}>{t('export_select_all') || 'Tutte'}</button>
                )}
                {selectedFamilies.length > 0 && (
                  <button type="button" onClick={clearAll}
                    data-testid="export-families-clear"
                    style={{
                      background: 'transparent', border: 'none', padding: 0,
                      color: 'var(--km)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      textTransform: 'none', letterSpacing: 0,
                    }}>{t('export_clear_all') || 'Nessuna'}</button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {families.map((f) => {
                const active = selectedFamilies.includes(f.id);
                return (
                  <button key={f.id} type="button"
                    data-testid={`export-fam-${f.id}`}
                    onClick={() => toggleFamily(f.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 100,
                      border: `1.5px solid ${active ? 'var(--ac)' : 'var(--sm)'}`,
                      background: active ? 'var(--ac)' : 'white',
                      color: active ? 'white' : 'var(--k)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                    {active && '✓ '}{f.emoji} {f.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PULSANTE 1: Apple Calendar */}
        <button
          type="button"
          data-testid="agenda-export-iphone-btn"
          onClick={() => handleExport('apple')}
          disabled={!canExport}
          title={disabledReason}
          style={{
            background: canExport
              ? 'linear-gradient(135deg, var(--ac) 0%, #B5563D 100%)'
              : 'var(--sm)',
            color: 'white', border: 'none',
            padding: '14px 18px', borderRadius: 14,
            fontSize: 15, fontWeight: 700,
            boxShadow: canExport ? '0 6px 18px rgba(193,98,75,0.28)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: canExport ? 'pointer' : 'not-allowed',
            opacity: canExport ? 1 : 0.6,
          }}>
          <span style={{ fontSize: 20 }}>📲</span>
          <span>{t('export_to_iphone') || 'Aggiungi a iPhone'}</span>
        </button>

        {/* PULSANTE 2: Google Calendar */}
        <button
          type="button"
          data-testid="agenda-export-google-btn"
          onClick={() => handleExport('google')}
          disabled={!canExport}
          title={disabledReason}
          style={{
            background: 'white',
            color: canExport ? 'var(--k)' : 'var(--km)',
            padding: '14px 18px', borderRadius: 14,
            fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            border: '1.5px solid var(--sm)',
            cursor: canExport ? 'pointer' : 'not-allowed',
            opacity: canExport ? 1 : 0.6,
          }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <span>{t('export_to_google') || 'Aggiungi a Google Calendar'}</span>
        </button>

        {!canExport && (
          <p style={{
            margin: '0', fontSize: 12, color: 'var(--km)',
            textAlign: 'center', fontStyle: 'italic',
          }} data-testid="export-hint-pick-family">
            ↑ {disabledReason}
          </p>
        )}
      </div>
    </div>
  );
}
