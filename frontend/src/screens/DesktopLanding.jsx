import { useT } from '../lib/i18n.jsx';

/**
 * DesktopLanding — landing mostrata su desktop a chi non è loggato.
 *
 * Contenuto portato 1:1 da public/home.html (la versione "/home"), reso in
 * React così resta DENTRO l'app: nessun redirect, nessuna navigazione →
 * sessione e cookie restano intatti. Sfondo a gradiente come la versione
 * desktop precedente. Badge store: Google Play (Android) e Apple → guida
 * installazione iOS (/ios-install.html, già multilingua).
 *
 * Lingua: usa l'i18n dell'app (useT) per lang + switch. Le stringhe della
 * landing sono locali (rispecchiano home.html) per non gonfiare i18n.jsx.
 */

const GRADIENT = 'linear-gradient(135deg, #FAF4ED 0%, #F0E6D7 100%)';
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.myfammy.twa';
const IOS_GUIDE_URL = '/ios-install.html';

const LANGS = [
  { code: 'it', flag: '🇮🇹', label: 'IT' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
];

const L10N = {
  it: {
    h1a: 'La tua famiglia,', h1b: 'finalmente organizzata.',
    lead: "FAMMY è l'app che tiene insieme la vita di famiglia: incarichi, agenda, spese e promemoria in un unico posto. Niente più conversazioni infinite per ricordarsi chi compra il pane.",
    f1: 'Incarichi condivisi, con una chat per ogni cosa da fare',
    f2: 'Agenda e compleanni, con sync Apple & Google Calendar',
    f3: 'Spese divise, anche a rate parziali',
    f4: "Assenze: vedi chi c'è in famiglia oggi",
    f5: 'Promemoria medicine con notifiche, per te e chi assisti',
    ctaTitle: 'Apri FAMMY', ctaText: 'Pensata per il mobile: aprila nel browser e installala come app dal tuo telefono.',
    ctaBtn: "Vai all'app →",
    getOn: 'Disponibile su', onIphone: 'Su iPhone', iosGuide: 'Guida installazione',
    phOver: '🏠 Famiglia Rossi · 3 da fare', phTitle: 'Bacheca',
    t1: 'Spesa al super', t1a: 'Assegnato a Mamma',
    t2: 'Visita pediatra', t2a: 'Assegnato a Papà',
    t3: 'Torta per Sofia', t3a: 'Assegnato a Tutti',
    t4: 'Cambio gomme', t4a: 'Assegnato a Marco',
    foot: "© 2026 FAMMY — app per l'organizzazione familiare",
    fPrivacy: 'Privacy', fTerms: 'Termini di servizio', fContact: 'Contatti',
  },
  en: {
    h1a: 'Your family,', h1b: 'finally organized.',
    lead: 'FAMMY is the app that holds family life together: tasks, calendar, expenses and reminders in one place. No more endless chats to remember who buys the bread.',
    f1: 'Shared tasks, with a chat for every to-do',
    f2: 'Calendar and birthdays, with Apple & Google Calendar sync',
    f3: 'Split expenses, even in partial instalments',
    f4: "Absences: see who's around in the family today",
    f5: 'Medication reminders with notifications, for you and those you care for',
    ctaTitle: 'Open FAMMY', ctaText: 'Built for mobile: open it in your browser and install it as an app on your phone.',
    ctaBtn: 'Go to the app →',
    getOn: 'Available on', onIphone: 'On iPhone', iosGuide: 'Install guide',
    phOver: '🏠 Rossi Family · 3 to do', phTitle: 'Board',
    t1: 'Grocery shopping', t1a: 'Assigned to Mum',
    t2: 'Pediatrician visit', t2a: 'Assigned to Dad',
    t3: 'Cake for Sofia', t3a: 'Assigned to Everyone',
    t4: 'Change tyres', t4a: 'Assigned to Marco',
    foot: '© 2026 FAMMY — family organization app',
    fPrivacy: 'Privacy', fTerms: 'Terms of Service', fContact: 'Contact',
  },
  fr: {
    h1a: 'Votre famille,', h1b: 'enfin organisée.',
    lead: "FAMMY est l'application qui rassemble la vie de famille : tâches, agenda, dépenses et rappels au même endroit. Fini les conversations sans fin pour savoir qui achète le pain.",
    f1: 'Tâches partagées, avec un chat pour chaque chose à faire',
    f2: 'Agenda et anniversaires, avec sync Apple & Google Calendar',
    f3: 'Dépenses partagées, même en versements partiels',
    f4: "Absences : voyez qui est présent dans la famille aujourd'hui",
    f5: 'Rappels de médicaments avec notifications, pour vous et vos proches',
    ctaTitle: 'Ouvrir FAMMY', ctaText: "Pensée pour le mobile : ouvrez-la dans votre navigateur et installez-la comme une app sur votre téléphone.",
    ctaBtn: "Accéder à l'app →",
    getOn: 'Disponible sur', onIphone: 'Sur iPhone', iosGuide: "Guide d'installation",
    phOver: '🏠 Famille Rossi · 3 à faire', phTitle: 'Tableau',
    t1: 'Courses au supermarché', t1a: 'Assigné à Maman',
    t2: 'Visite pédiatre', t2a: 'Assigné à Papa',
    t3: 'Gâteau pour Sofia', t3a: 'Assigné à Tous',
    t4: 'Changement de pneus', t4a: 'Assigné à Marco',
    foot: "© 2026 FAMMY — application d'organisation familiale",
    fPrivacy: 'Confidentialité', fTerms: "Conditions d'utilisation", fContact: 'Contact',
  },
  de: {
    h1a: 'Deine Familie,', h1b: 'endlich organisiert.',
    lead: 'FAMMY ist die App, die das Familienleben zusammenhält: Aufgaben, Kalender, Ausgaben und Erinnerungen an einem Ort. Keine endlosen Chats mehr, um zu wissen, wer das Brot kauft.',
    f1: 'Geteilte Aufgaben, mit einem Chat für jede To-do',
    f2: 'Kalender und Geburtstage, mit Apple & Google Calendar Sync',
    f3: 'Geteilte Ausgaben, auch in Teilbeträgen',
    f4: 'Abwesenheiten: sieh, wer heute in der Familie da ist',
    f5: 'Medikamenten-Erinnerungen mit Benachrichtigungen, für dich und deine Angehörigen',
    ctaTitle: 'FAMMY öffnen', ctaText: 'Für mobil gemacht: im Browser öffnen und als App auf dem Handy installieren.',
    ctaBtn: 'Zur App →',
    getOn: 'Verfügbar bei', onIphone: 'Auf dem iPhone', iosGuide: 'Installations­anleitung',
    phOver: '🏠 Familie Rossi · 3 zu erledigen', phTitle: 'Board',
    t1: 'Einkaufen im Supermarkt', t1a: 'Zugewiesen an Mama',
    t2: 'Kinderarztbesuch', t2a: 'Zugewiesen an Papa',
    t3: 'Kuchen für Sofia', t3a: 'Zugewiesen an Alle',
    t4: 'Reifenwechsel', t4a: 'Zugewiesen an Marco',
    foot: '© 2026 FAMMY — App für Familienorganisation',
    fPrivacy: 'Datenschutz', fTerms: 'Nutzungsbedingungen', fContact: 'Kontakt',
  },
};

export default function DesktopLanding({ onContinueAnyway }) {
  const { lang, setLang } = useT();
  const L = L10N[lang] || L10N.it;

  const features = [
    { e: '📋', t: L.f1 }, { e: '📅', t: L.f2 }, { e: '💸', t: L.f3 },
    { e: '✈️', t: L.f4 }, { e: '💊', t: L.f5 },
  ];
  const mockTasks = [
    { e: '🛒', h: L.t1, s: L.t1a }, { e: '🩺', h: L.t2, s: L.t2a },
    { e: '🎂', h: L.t3, s: L.t3a }, { e: '🚗', h: L.t4, s: L.t4a },
  ];

  const goApp = () => { if (onContinueAnyway) onContinueAnyway(); };

  return (
    <div data-testid="desktop-landing" style={{
      minHeight: '100vh', background: GRADIENT,
      fontFamily: "'Outfit', system-ui, sans-serif", color: 'var(--k)',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px' }}>

        {/* HEADER */}
        <header style={{
          padding: '28px 0', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontWeight: 600, fontSize: 15, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--ac)',
            background: 'white', border: '1px solid var(--sm)',
            padding: '8px 16px', borderRadius: 999,
          }}>
            <span style={{ fontSize: 18 }}>🏡</span> FAMMY
          </span>
          <div style={{
            display: 'inline-flex', gap: 4, background: 'white',
            border: '1px solid var(--sm)', borderRadius: 999, padding: 4,
          }} data-testid="dl-lang-switcher">
            {LANGS.map((l) => {
              const active = lang === l.code;
              return (
                <button key={l.code} type="button" onClick={() => setLang(l.code)}
                  data-testid={`dl-lang-${l.code}`} aria-label={l.label}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 13, fontWeight: 600, border: 0, cursor: 'pointer',
                    padding: '6px 12px', borderRadius: 999,
                    background: active ? 'var(--k)' : 'transparent',
                    color: active ? '#fff' : 'var(--km)',
                  }}>
                  <span style={{ fontSize: 13 }}>{l.flag}</span>{l.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* HERO */}
        <section style={{
          display: 'grid', gap: 56, alignItems: 'center',
          padding: '40px 0 72px',
        }} className="dl-hero">
          <div>
            <h1 style={{
              fontFamily: 'var(--fs)', fontWeight: 400,
              fontSize: 'clamp(40px, 4.5vw, 60px)', lineHeight: 1.02,
              letterSpacing: '-0.02em', marginBottom: 20,
            }}>
              {L.h1a}<br /><span style={{ color: 'var(--ac)' }}>{L.h1b}</span>
            </h1>
            <p style={{ fontSize: 19, color: 'var(--km)', maxWidth: 460, marginBottom: 32, lineHeight: 1.55 }}>
              {L.lead}
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 36px', display: 'grid', gap: 16 }}>
              {features.map((f, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 16 }}>
                  <span style={{
                    width: 40, height: 40, flex: '0 0 40px', borderRadius: 12,
                    display: 'grid', placeItems: 'center', fontSize: 19,
                    background: 'white', border: '1px solid var(--sm)',
                  }}>{f.e}</span>
                  {f.t}
                </li>
              ))}
            </ul>

            {/* CTA CARD */}
            <div style={{
              background: 'white', border: '1px solid var(--sm)', borderRadius: 24,
              padding: 24, boxShadow: '0 8px 30px rgba(44,48,42,0.04)', maxWidth: 460,
            }}>
              <h3 style={{ fontWeight: 600, fontSize: 17, marginBottom: 4 }}>{L.ctaTitle}</h3>
              <p style={{ fontSize: 14, color: 'var(--km)', marginBottom: 16 }}>{L.ctaText}</p>
              <button type="button" onClick={goApp} data-testid="dl-go-app"
                style={{
                  display: 'inline-block', background: 'var(--ac)', color: '#fff',
                  border: 'none', fontWeight: 600, fontSize: 16, cursor: 'pointer',
                  padding: '14px 28px', borderRadius: 999,
                }}>
                {L.ctaBtn}
              </button>

              {/* Badge store */}
              <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                <a href={PLAY_URL} target="_blank" rel="noopener" data-testid="dl-badge-android"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', borderRadius: 12,
                    background: '#1C1611', color: 'white', textDecoration: 'none',
                  }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.224a1 1 0 010 1.034l-2.006 1.16L13.4 12l2.293-2.293 2.005 1.776zM5.864 3.658L16.8 9.99l-2.302 2.302-8.635-8.634z"/>
                  </svg>
                  <span style={{ lineHeight: 1.2 }}>
                    <span style={{ display: 'block', fontSize: 10, opacity: 0.8 }}>{L.getOn}</span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>Google Play</span>
                  </span>
                </a>

                <a href={IOS_GUIDE_URL} target="_blank" rel="noopener" data-testid="dl-badge-ios"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', borderRadius: 12,
                    background: '#1C1611', color: 'white', textDecoration: 'none',
                  }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span style={{ lineHeight: 1.2 }}>
                    <span style={{ display: 'block', fontSize: 10, opacity: 0.8 }}>{L.onIphone}</span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{L.iosGuide}</span>
                  </span>
                </a>
              </div>
            </div>
          </div>

          {/* PHONE MOCKUP */}
          <div style={{ justifySelf: 'center' }} className="dl-phone">
            <div style={{
              width: 300, height: 610, background: '#111', borderRadius: 44,
              padding: 12, boxShadow: '0 24px 60px rgba(44,48,42,0.18)',
            }}>
              <div style={{
                width: '100%', height: '100%', background: '#FAF4ED', borderRadius: 34,
                padding: '22px 18px', overflow: 'hidden', position: 'relative',
              }}>
                <div style={{ width: 110, height: 26, background: '#111', borderRadius: '0 0 16px 16px', margin: '-22px auto 14px' }} />
                <div style={{ fontSize: 12, color: 'var(--km)', marginBottom: 2 }}>{L.phOver}</div>
                <div style={{ fontFamily: 'var(--fs)', fontSize: 30, marginBottom: 16 }}>{L.phTitle}</div>
                {mockTasks.map((c, i) => (
                  <div key={i} style={{
                    background: 'white', border: '1px solid var(--sm)', borderRadius: 18,
                    padding: '13px 14px', marginBottom: 11, display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--ab)', flex: '0 0 34px', display: 'grid', placeItems: 'center', fontSize: 18 }}>{c.e}</span>
                    <span>
                      <span style={{ fontSize: 14, fontWeight: 500, display: 'block' }}>{c.h}</span>
                      <span style={{ fontSize: 12, color: 'var(--km)' }}>{c.s}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{
          borderTop: '1px solid var(--sm)', padding: '32px 0 48px',
          color: 'var(--km)', fontSize: 14, display: 'flex', flexWrap: 'wrap',
          gap: '8px 24px', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>{L.foot}</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="/privacy" style={{ color: 'var(--km)', textDecoration: 'none' }}>{L.fPrivacy}</a>
            <a href="/terms" style={{ color: 'var(--km)', textDecoration: 'none' }}>{L.fTerms}</a>
            <a href="mailto:raffael.renga84@gmail.com" style={{ color: 'var(--km)', textDecoration: 'none' }}>{L.fContact}</a>
          </div>
        </footer>
      </div>

      <style>{`
        .dl-hero { grid-template-columns: 1fr 1fr; }
        @media (max-width: 860px) {
          .dl-hero { grid-template-columns: 1fr !important; gap: 40px !important; }
          .dl-phone { display: none !important; }
        }
      `}</style>
    </div>
  );
}
