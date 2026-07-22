import { useMemo } from 'react';

const DISMISSED_KEY = 'fammy_setup_checklist_dismissed';

/**
 * OnboardingChecklist — banner "Completa il setup 2/5" in cima alla Bacheca,
 * visibile finché tutti i passi non sono completati o l'utente lo dismissa.
 *
 * Step:
 *  1) Aggiungi un membro alla famiglia (>= 2 membri totali, o invitati)
 *  2) Crea il primo incarico
 *  3) Attiva le notifiche push
 *  4) Imposta foto/emoji famiglia (presente da sempre, ma puo' essere default)
 *  5) Esporta agenda sul calendario (almeno una volta)
 *
 * Logica derivata: niente DB nuovo, basta leggere lo stato (tasks, members,
 * notification permission, family object, localStorage flag per export).
 */
export default function OnboardingChecklist({
  family, members = [], tasks = [], notificationPermission, onAddTask, onInviteFamily, onExportAgenda,
}) {
  const dismissed = (() => {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  })();

  const familyMembersOfThis = useMemo(
    () => members.filter((m) => m.family_id === family?.id),
    [members, family?.id]
  );

  const steps = [
    {
      id: 'members',
      label: 'Aggiungi un membro o invita qualcuno',
      done: familyMembersOfThis.length >= 2,
      onClick: onInviteFamily,
    },
    {
      id: 'task',
      label: 'Crea il primo incarico',
      done: tasks.length >= 1,
      onClick: onAddTask,
    },
    {
      id: 'notif',
      label: 'Attiva le notifiche push',
      done: notificationPermission === 'granted',
      onClick: () => {
        // Porta l'utente alla sezione Notifiche del Profilo (con il pulsante
        // "Riprova abilitazione" e le istruzioni iOS). requestPermission() da
        // solo è un no-op quando iOS ha già negato il permesso.
        window.dispatchEvent(new CustomEvent('fammy_go_profile', { detail: { section: 'notifications' } }));
      },
    },
    {
      id: 'export',
      label: 'Esporta agenda sul calendario',
      done: (() => {
        try { return localStorage.getItem('fammy_exported_ics') === '1'; } catch { return false; }
      })(),
      onClick: onExportAgenda,
    },
  ];

  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === total;

  // Non mostrare se completato o dismissato
  if (allDone || dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch (e) {}
    // Forza un rerender: l'unico modo pulito senza state e' reload, ma per
    // semplicita' aggiungiamo un attributo dataset (parent re-renders al
    // refresh successivo). Per ora non riapparira' nella stessa sessione
    // se ricreiamo il component manualmente. La next ricarica e' OK.
    window.dispatchEvent(new CustomEvent('fammy_checklist_dismissed'));
  };

  const progressPct = (completed / total) * 100;

  return (
    <div data-testid="onboarding-checklist" style={{
      margin: '8px 16px 12px',
      padding: '16px',
      background: 'linear-gradient(135deg, #FFF5EE 0%, #FFE9CD 100%)',
      border: '1px solid #F5C9AC',
      borderRadius: 18,
      boxShadow: '0 4px 14px rgba(193,98,75,0.12)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
            color: 'var(--ac)', textTransform: 'uppercase', marginBottom: 2,
          }}>
            Setup famiglia · {completed}/{total}
          </div>
          <div style={{
            fontFamily: 'var(--fs)', fontSize: 17, fontWeight: 500,
            color: 'var(--k)', letterSpacing: '-0.01em', lineHeight: 1.2,
          }}>
            Completa il setup per sfruttare al massimo FAMMY
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          data-testid="onboarding-checklist-dismiss"
          aria-label="Chiudi"
          style={{
            width: 28, height: 28, borderRadius: '50%',
            border: 'none', background: 'rgba(28,22,17,0.06)',
            cursor: 'pointer', fontSize: 14, fontWeight: 700,
            color: 'var(--km)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>✕</button>
      </div>

      {/* Barra progresso */}
      <div style={{
        height: 6, borderRadius: 100, background: 'rgba(193,98,75,0.18)',
        overflow: 'hidden', marginBottom: 14,
      }}>
        <div style={{
          width: `${progressPct}%`, height: '100%',
          background: 'linear-gradient(90deg, var(--ac) 0%, #B5563D 100%)',
          borderRadius: 100,
          transition: 'width 0.4s ease',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            disabled={step.done}
            onClick={step.onClick}
            data-testid={`onboarding-step-${step.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              background: step.done ? 'transparent' : 'rgba(255,255,255,0.75)',
              border: 'none', borderRadius: 10,
              cursor: step.done ? 'default' : 'pointer',
              textAlign: 'left', width: '100%',
              transition: 'background 0.15s ease',
            }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              background: step.done ? 'var(--ac)' : 'transparent',
              border: step.done ? '2px solid var(--ac)' : '2px solid var(--sm)',
              color: 'white', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{step.done && '✓'}</span>
            <span style={{
              fontSize: 13, fontWeight: step.done ? 500 : 600,
              color: step.done ? 'var(--km)' : 'var(--k)',
              textDecoration: step.done ? 'line-through' : 'none',
              opacity: step.done ? 0.65 : 1,
              flex: 1,
            }}>{step.label}</span>
            {!step.done && <span style={{ fontSize: 16, color: 'var(--ac)' }}>›</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
