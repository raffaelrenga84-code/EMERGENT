import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

const DISMISSED_KEY = 'fammy_notifications_prompt_dismissed';

// i18n locale it/en/fr/de (pattern EditFamilyModal), via `lang` da useT().
const L = {
  it: {
    title1: 'Tieni la famiglia', title2: 'sempre sincronizzata',
    p1a: 'Senza notifiche, la tua famiglia ', p1b: 'non saprà', p1c: ' che hai aggiunto un incarico o che qualcuno ti ha delegato qualcosa.',
    p2a: 'FAMMY ti avvisa solo per le cose ', p2b: 'davvero importanti', p2c: ': incarichi urgenti, nuovi eventi, commenti diretti.',
    p3: '{tr.p3}',
    waiting: '⏳ Attendo conferma…', allow: '🔔 Attiva notifiche', later: 'Non ora',
  },
  en: {
    title1: 'Keep your family', title2: 'always in sync',
    p1a: 'Without notifications, your family ', p1b: "won't know", p1c: ' that you added a task or that someone delegated something to you.',
    p2a: 'FAMMY only alerts you about things that ', p2b: 'really matter', p2c: ': urgent tasks, new events, direct comments.',
    p3: 'You can turn them off anytime from your Profile, or enable the night "Do not disturb".',
    waiting: '⏳ Waiting for confirmation…', allow: '🔔 Enable notifications', later: 'Not now',
  },
  fr: {
    title1: 'Garde ta famille', title2: 'toujours synchronisée',
    p1a: 'Sans notifications, ta famille ', p1b: 'ne saura pas', p1c: ' que tu as ajouté une tâche ou que quelqu\u2019un t\u2019a délégué quelque chose.',
    p2a: 'FAMMY ne t\u2019avertit que pour les choses ', p2b: 'vraiment importantes', p2c: ' : tâches urgentes, nouveaux événements, commentaires directs.',
    p3: 'Tu peux les désactiver à tout moment depuis le Profil, ou activer le « Ne pas déranger » nocturne.',
    waiting: '⏳ En attente de confirmation…', allow: '🔔 Activer les notifications', later: 'Pas maintenant',
  },
  de: {
    title1: 'Halte deine Familie', title2: 'immer synchron',
    p1a: 'Ohne Benachrichtigungen ', p1b: 'weiß deine Familie nicht', p1c: ', dass du eine Aufgabe hinzugefügt hast oder dass dir jemand etwas übertragen hat.',
    p2a: 'FAMMY benachrichtigt dich nur bei ', p2b: 'wirklich wichtigen Dingen', p2c: ': dringende Aufgaben, neue Ereignisse, direkte Kommentare.',
    p3: 'Du kannst sie jederzeit im Profil deaktivieren oder das nächtliche „Nicht stören" aktivieren.',
    waiting: '⏳ Warte auf Bestätigung…', allow: '🔔 Benachrichtigungen aktivieren', later: 'Nicht jetzt',
  },
};


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
  const { lang } = useT();
  const tr = L[lang] || L.it;
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
          {tr.title1}<br />{tr.title2}
        </h2>

        <p style={{
          fontSize: 14, lineHeight: 1.55, color: 'var(--km)',
          margin: '0 0 22px', padding: '0 8px',
        }}>
          {tr.p1a}<strong>{tr.p1b}</strong>{tr.p1c}
          <br /><br />
          {tr.p2a}<strong>{tr.p2b}</strong>{tr.p2c}
          <br /><br />
          <em style={{ fontSize: 13, opacity: 0.85 }}>{tr.p3}</em>
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
          {requesting ? tr.waiting : tr.allow}
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
          {tr.later}
        </button>
      </div>
    </div>
  );
}
