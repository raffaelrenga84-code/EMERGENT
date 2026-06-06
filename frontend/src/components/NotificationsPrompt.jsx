import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'fammy_notifications_prompt_dismissed';

/**
 * NotificationsPrompt — pop-up bloccante con messaggio CALDO che spiega
 * perché FAMMY ha bisogno delle notifiche.
 *
 * Mostrato:
 *  - quando notificationPermission === 'default' (mai chiesto)
 *  - AND l'utente è loggato + ha almeno una famiglia
 *  - AND non l'ha già dismissato in questa sessione
 *
 * NON si mostra se l'utente è già "denied" (a quel punto deve andare in
 * Impostazioni del browser, non possiamo riproporre il prompt).
 *
 * Stile Zenzap: motivazione calda, no avviso freddo "consenti notifiche".
 */
export default function NotificationsPrompt({ onGranted, onDismiss }) {
  const [requesting, setRequesting] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  });

  const handleAllow = async () => {
    if (typeof Notification === 'undefined') {
      setDismissed(true);
      sessionStorage.setItem(DISMISSED_KEY, '1');
      onDismiss?.();
      return;
    }
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        onGranted?.();
      } else {
        // L'utente ha negato → dismiss per evitare di riproporlo (lo trova in Profilo)
        sessionStorage.setItem(DISMISSED_KEY, '1');
        setDismissed(true);
        onDismiss?.();
      }
    } catch (e) {
      console.warn('Notification request failed', e);
    } finally {
      setRequesting(false);
    }
  };

  const handleLater = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  return (
    <div
      data-testid="notifications-prompt"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(28,22,17,0.78)',
        zIndex: 2500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(6px)',
      }}>
      <div style={{
        background: 'white', borderRadius: 22,
        padding: '28px 24px 22px',
        maxWidth: 380, width: '100%',
        boxShadow: '0 20px 50px rgba(28,22,17,0.4)',
        textAlign: 'center',
        animation: 'fammy-pop-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        <style>{`
          @keyframes fammy-pop-in {
            from { transform: scale(0.92); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
        <div style={{
          width: 84, height: 84, borderRadius: 24,
          background: 'linear-gradient(135deg, #FFE9CD 0%, #FFD4A5 100%)',
          margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44,
        }}>🔔</div>

        <h2 style={{
          margin: '0 0 10px',
          fontFamily: 'var(--fs)', fontSize: 24, fontWeight: 500,
          letterSpacing: '-0.02em', color: 'var(--k)', lineHeight: 1.2,
        }}>
          Tieni la famiglia<br />sempre sincronizzata
        </h2>

        <p style={{
          fontSize: 14, lineHeight: 1.55, color: 'var(--km)',
          margin: '0 0 22px', padding: '0 8px',
        }}>
          Senza notifiche, la tua famiglia <strong>non saprà</strong> che
          hai aggiunto un incarico o che qualcuno ti ha delegato qualcosa.
          <br /><br />
          FAMMY ti avvisa solo per le cose <strong>davvero importanti</strong>:
          incarichi urgenti, nuovi eventi, commenti diretti.
          <br /><br />
          <em style={{ fontSize: 13, opacity: 0.85 }}>Puoi disattivarle in qualsiasi momento dal Profilo, oppure attivare il "Non disturbare" notturno.</em>
        </p>

        <button
          type="button"
          onClick={handleAllow}
          disabled={requesting}
          data-testid="notifications-prompt-allow"
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 14,
            background: 'linear-gradient(135deg, var(--ac) 0%, #B5563D 100%)',
            color: 'white', border: 'none',
            fontSize: 15, fontWeight: 700,
            cursor: 'pointer', marginBottom: 8,
            boxShadow: '0 8px 22px rgba(193,98,75,0.4)',
          }}>
          {requesting ? '⏳ Attendo conferma…' : '🔔 Attiva notifiche'}
        </button>
        <button
          type="button"
          onClick={handleLater}
          data-testid="notifications-prompt-later"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12,
            background: 'transparent', border: 'none',
            color: 'var(--km)', fontSize: 13, fontWeight: 600,
            cursor: 'pointer',
          }}>
          Non ora
        </button>
      </div>
    </div>
  );
}
