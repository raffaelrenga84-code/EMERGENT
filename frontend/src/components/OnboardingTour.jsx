import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * Tour onboarding mostrato solo al primo login.
 * 4 slide: benvenuto, funzionalità, multi-famiglia, aggiungi a Home (auto iOS/Android).
 * Si chiude per sempre via localStorage flag 'fammy_onboarding_done'.
 *
 * i18n: dizionario locale it/en/fr/de (stesso pattern di EditFamilyModal),
 * selezionato via `lang` da useT(). Nessuna chiave nel dizionario centrale.
 */

const L = {
  it: {
    s1t: 'Benvenuto in FAMMY',
    s1b: 'Coordina la tua famiglia: incarichi, agenda e spese in un unico posto. Tutti aggiornati, niente più chat infinite.',
    s2t: 'Bacheca, Agenda, Spese',
    s2_board_h: '📋 Bacheca', s2_board: '— incarichi della famiglia, chi fa cosa.',
    s2_agenda_h: '📅 Agenda', s2_agenda: '— eventi, compleanni e appuntamenti.',
    s2_exp_h: '💶 Spese', s2_exp: '— chi ha pagato cosa, quote divise.',
    s3t: "Più famiglie, un'app",
    s3b: 'Crea un cerchio per ogni famiglia (genitori, suoceri, amici). Condividi un link e gli altri si uniscono. Vista "Tutte" per vedere tutto insieme.',
    s4t: 'Aggiungi alla Home',
    back: 'Indietro', next: 'Avanti', start: 'Inizia ✓',
    skip: 'Salta il tour', skipTitle: 'Salta tour',
    iosH: 'Su iPhone (Safari):',
    ios1a: 'Tocca il pulsante ', ios1b: 'Condividi', ios1c: ' in basso (📤)',
    ios2a: 'Scorri e scegli ', ios2b: '"Aggiungi alla schermata Home"',
    ios3a: 'Tocca ', ios3b: 'Aggiungi', ios3c: ' in alto a destra',
    afterInstall: "Dopo, FAMMY si apre come un'app vera e propria.",
    andH: 'Su Android (Chrome):',
    and1a: 'Tocca il menu ', and1b: '⋮', and1c: ' in alto a destra',
    and2a: 'Scegli ', and2b: '"Installa app"', and2c: ' o ', and2d: '"Aggiungi alla schermata Home"',
    and3a: 'Conferma con ', and3b: 'Installa',
    deskIntro: 'Stai usando FAMMY dal browser desktop. Per la migliore esperienza, apri FAMMY dal telefono e aggiungilo alla schermata Home:',
    deskIos: 'iPhone (Safari):', deskIosSteps: 'Condividi → Aggiungi alla Home',
    deskAnd: 'Android (Chrome):', deskAndSteps: 'Menu ⋮ → Installa app',
  },
  en: {
    s1t: 'Welcome to FAMMY',
    s1b: 'Coordinate your family: tasks, calendar and expenses in one place. Everyone stays up to date, no more endless chats.',
    s2t: 'Board, Agenda, Expenses',
    s2_board_h: '📋 Board', s2_board: '— family tasks, who does what.',
    s2_agenda_h: '📅 Agenda', s2_agenda: '— events, birthdays and appointments.',
    s2_exp_h: '💶 Expenses', s2_exp: '— who paid what, split shares.',
    s3t: 'Many families, one app',
    s3b: 'Create a circle for each family (parents, in-laws, friends). Share a link and the others join. Use the "All" view to see everything together.',
    s4t: 'Add to Home Screen',
    back: 'Back', next: 'Next', start: 'Start ✓',
    skip: 'Skip the tour', skipTitle: 'Skip tour',
    iosH: 'On iPhone (Safari):',
    ios1a: 'Tap the ', ios1b: 'Share', ios1c: ' button at the bottom (📤)',
    ios2a: 'Scroll and choose ', ios2b: '"Add to Home Screen"',
    ios3a: 'Tap ', ios3b: 'Add', ios3c: ' in the top right',
    afterInstall: 'After that, FAMMY opens like a real app.',
    andH: 'On Android (Chrome):',
    and1a: 'Tap the ', and1b: '⋮', and1c: ' menu in the top right',
    and2a: 'Choose ', and2b: '"Install app"', and2c: ' or ', and2d: '"Add to Home screen"',
    and3a: 'Confirm with ', and3b: 'Install',
    deskIntro: "You're using FAMMY in a desktop browser. For the best experience, open FAMMY on your phone and add it to your Home Screen:",
    deskIos: 'iPhone (Safari):', deskIosSteps: 'Share → Add to Home Screen',
    deskAnd: 'Android (Chrome):', deskAndSteps: 'Menu ⋮ → Install app',
  },
  fr: {
    s1t: 'Bienvenue sur FAMMY',
    s1b: 'Coordonnez votre famille : tâches, agenda et dépenses au même endroit. Tout le monde reste à jour, fini les conversations sans fin.',
    s2t: 'Tableau, Agenda, Dépenses',
    s2_board_h: '📋 Tableau', s2_board: '— les tâches de la famille, qui fait quoi.',
    s2_agenda_h: '📅 Agenda', s2_agenda: '— événements, anniversaires et rendez-vous.',
    s2_exp_h: '💶 Dépenses', s2_exp: '— qui a payé quoi, parts réparties.',
    s3t: 'Plusieurs familles, une app',
    s3b: 'Créez un cercle pour chaque famille (parents, beaux-parents, amis). Partagez un lien et les autres vous rejoignent. La vue « Toutes » montre tout ensemble.',
    s4t: "Ajouter à l'écran d'accueil",
    back: 'Retour', next: 'Suivant', start: 'Commencer ✓',
    skip: 'Passer le tour', skipTitle: 'Passer le tour',
    iosH: 'Sur iPhone (Safari) :',
    ios1a: 'Touchez le bouton ', ios1b: 'Partager', ios1c: ' en bas (📤)',
    ios2a: 'Faites défiler et choisissez ', ios2b: "« Sur l'écran d'accueil »",
    ios3a: 'Touchez ', ios3b: 'Ajouter', ios3c: ' en haut à droite',
    afterInstall: "Ensuite, FAMMY s'ouvre comme une vraie application.",
    andH: 'Sur Android (Chrome) :',
    and1a: 'Touchez le menu ', and1b: '⋮', and1c: ' en haut à droite',
    and2a: 'Choisissez ', and2b: "« Installer l'application »", and2c: ' ou ', and2d: "« Ajouter à l'écran d'accueil »",
    and3a: 'Confirmez avec ', and3b: 'Installer',
    deskIntro: "Vous utilisez FAMMY depuis un navigateur de bureau. Pour une meilleure expérience, ouvrez FAMMY sur votre téléphone et ajoutez-la à l'écran d'accueil :",
    deskIos: 'iPhone (Safari) :', deskIosSteps: "Partager → Sur l'écran d'accueil",
    deskAnd: 'Android (Chrome) :', deskAndSteps: "Menu ⋮ → Installer l'application",
  },
  de: {
    s1t: 'Willkommen bei FAMMY',
    s1b: 'Koordiniere deine Familie: Aufgaben, Kalender und Ausgaben an einem Ort. Alle bleiben auf dem Laufenden, keine endlosen Chats mehr.',
    s2t: 'Board, Kalender, Ausgaben',
    s2_board_h: '📋 Board', s2_board: '— Familienaufgaben, wer macht was.',
    s2_agenda_h: '📅 Kalender', s2_agenda: '— Ereignisse, Geburtstage und Termine.',
    s2_exp_h: '💶 Ausgaben', s2_exp: '— wer hat was bezahlt, geteilte Anteile.',
    s3t: 'Mehrere Familien, eine App',
    s3b: 'Erstelle einen Kreis für jede Familie (Eltern, Schwiegereltern, Freunde). Teile einen Link und die anderen treten bei. Die Ansicht „Alle" zeigt alles zusammen.',
    s4t: 'Zum Home-Bildschirm hinzufügen',
    back: 'Zurück', next: 'Weiter', start: 'Los geht\u2019s ✓',
    skip: 'Tour überspringen', skipTitle: 'Tour überspringen',
    iosH: 'Auf dem iPhone (Safari):',
    ios1a: 'Tippe unten auf ', ios1b: 'Teilen', ios1c: ' (📤)',
    ios2a: 'Scrolle und wähle ', ios2b: '„Zum Home-Bildschirm"',
    ios3a: 'Tippe oben rechts auf ', ios3b: 'Hinzufügen', ios3c: '',
    afterInstall: 'Danach öffnet sich FAMMY wie eine richtige App.',
    andH: 'Auf Android (Chrome):',
    and1a: 'Tippe oben rechts auf das Menü ', and1b: '⋮', and1c: '',
    and2a: 'Wähle ', and2b: '„App installieren"', and2c: ' oder ', and2d: '„Zum Startbildschirm hinzufügen"',
    and3a: 'Bestätige mit ', and3b: 'Installieren',
    deskIntro: 'Du nutzt FAMMY im Desktop-Browser. Für das beste Erlebnis öffne FAMMY auf dem Handy und füge es zum Home-Bildschirm hinzu:',
    deskIos: 'iPhone (Safari):', deskIosSteps: 'Teilen → Zum Home-Bildschirm',
    deskAnd: 'Android (Chrome):', deskAndSteps: 'Menü ⋮ → App installieren',
  },
};

export default function OnboardingTour({ onClose }) {
  const { lang } = useT();
  const tr = L[lang] || L.it;
  const [step, setStep] = useState(0);

  // Auto-detect dispositivo per slide finale
  const platform = detectPlatform();

  const slides = [
    {
      emoji: '🏡',
      title: tr.s1t,
      body: tr.s1b,
    },
    {
      emoji: '📋',
      title: tr.s2t,
      body: (
        <>
          <div style={{ marginBottom: 8 }}><strong>{tr.s2_board_h}</strong> {tr.s2_board}</div>
          <div style={{ marginBottom: 8 }}><strong>{tr.s2_agenda_h}</strong> {tr.s2_agenda}</div>
          <div><strong>{tr.s2_exp_h}</strong> {tr.s2_exp}</div>
        </>
      ),
    },
    {
      emoji: '👨‍👩‍👧‍👦',
      title: tr.s3t,
      body: tr.s3b,
    },
    {
      emoji: '📱',
      title: tr.s4t,
      body: <PlatformInstructions platform={platform} tr={tr} />,
    },
  ];

  const isLast = step === slides.length - 1;
  const slide = slides[step];

  const finish = () => {
    try { localStorage.setItem('fammy_onboarding_done', '1'); } catch (e) {}
    onClose && onClose();
  };

  // ESC per chiudere
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') finish(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="modal-bg" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal" style={{ maxWidth: 380, padding: 24, textAlign: 'center' }}>
        <button
          onClick={finish}
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'none', border: 'none', fontSize: 22, color: 'var(--km)',
            cursor: 'pointer', padding: 4, lineHeight: 1,
          }}
          title={tr.skipTitle}
        >✕</button>

        <div style={{ fontSize: 64, marginBottom: 8 }}>{slide.emoji}</div>
        <h2 style={{ marginBottom: 12 }}>{slide.title}</h2>
        <div style={{ fontSize: 14, color: 'var(--km)', lineHeight: 1.5, textAlign: 'left', marginBottom: 24 }}>
          {slide.body}
        </div>

        {/* Dot indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          {slides.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 100,
              background: i === step ? 'var(--ac)' : 'var(--sm)',
              transition: 'all 0.2s ease',
            }} />
          ))}
        </div>

        {/* Bottoni */}
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button
              className="btn secondary"
              onClick={() => setStep(step - 1)}
              style={{ flex: 1 }}
            >{tr.back}</button>
          )}
          {!isLast ? (
            <button
              className="btn"
              onClick={() => setStep(step + 1)}
              style={{ flex: 2 }}
            >{tr.next}</button>
          ) : (
            <button
              className="btn"
              onClick={finish}
              style={{ flex: 2 }}
            >{tr.start}</button>
          )}
        </div>

        {step === 0 && (
          <button
            onClick={finish}
            style={{
              marginTop: 12, background: 'none', border: 'none',
              color: 'var(--km)', fontSize: 12, cursor: 'pointer',
            }}
          >{tr.skip}</button>
        )}
      </div>
    </div>
  );
}

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function PlatformInstructions({ platform, tr }) {
  if (platform === 'ios') {
    return (
      <>
        <p style={{ marginBottom: 10 }}>
          <strong>{tr.iosH}</strong>
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>{tr.ios1a}<strong>{tr.ios1b}</strong>{tr.ios1c}</li>
          <li>{tr.ios2a}<strong>{tr.ios2b}</strong></li>
          <li>{tr.ios3a}<strong>{tr.ios3b}</strong>{tr.ios3c}</li>
        </ol>
        <p style={{ marginTop: 10, fontSize: 12, fontStyle: 'italic' }}>
          {tr.afterInstall}
        </p>
      </>
    );
  }
  if (platform === 'android') {
    return (
      <>
        <p style={{ marginBottom: 10 }}>
          <strong>{tr.andH}</strong>
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>{tr.and1a}<strong>{tr.and1b}</strong>{tr.and1c}</li>
          <li>{tr.and2a}<strong>{tr.and2b}</strong>{tr.and2c}<strong>{tr.and2d}</strong></li>
          <li>{tr.and3a}<strong>{tr.and3b}</strong></li>
        </ol>
        <p style={{ marginTop: 10, fontSize: 12, fontStyle: 'italic' }}>
          {tr.afterInstall}
        </p>
      </>
    );
  }
  // Desktop
  return (
    <>
      <p style={{ marginBottom: 10 }}>
        {tr.deskIntro}
      </p>
      <ul style={{ paddingLeft: 20, margin: 0, fontSize: 13 }}>
        <li><strong>{tr.deskIos}</strong> {tr.deskIosSteps}</li>
        <li><strong>{tr.deskAnd}</strong> {tr.deskAndSteps}</li>
      </ul>
    </>
  );
}
