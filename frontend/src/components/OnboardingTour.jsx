import { useEffect, useState } from 'react';

/**
 * Tour onboarding mostrato solo al primo login.
 * 4 slide: benvenuto, funzionalità, multi-famiglia, aggiungi a Home (auto iOS/Android).
 * Si chiude per sempre via localStorage flag 'fammy_onboarding_done'.
 */
export default function OnboardingTour({ onClose }) {
  const [step, setStep] = useState(0);

  // Auto-detect dispositivo per slide finale
  const platform = detectPlatform();

  const slides = [
    {
      emoji: '🏡',
      title: 'Benvenuto in FAMMY',
      body: 'Coordina la tua famiglia: incarichi, agenda e spese in un unico posto. Tutti aggiornati, niente più chat infinite.',
    },
    {
      emoji: '📋',
      title: 'Bacheca, Agenda, Spese',
      body: (
        <>
          <div style={{ marginBottom: 8 }}><strong>📋 Bacheca</strong> — incarichi della famiglia, chi fa cosa.</div>
          <div style={{ marginBottom: 8 }}><strong>📅 Agenda</strong> — eventi, compleanni e appuntamenti.</div>
          <div><strong>💶 Spese</strong> — chi ha pagato cosa, quote divise.</div>
        </>
      ),
    },
    {
      emoji: '👨‍👩‍👧‍👦',
      title: 'Più famiglie, un\'app',
      body: 'Crea un cerchio per ogni famiglia (genitori, suoceri, amici). Condividi un link e gli altri si uniscono. Vista "Tutte" per vedere tutto insieme.',
    },
    {
      emoji: '📱',
      title: 'Aggiungi alla Home',
      body: <PlatformInstructions platform={platform} />,
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
          title="Salta tour"
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
            >Indietro</button>
          )}
          {!isLast ? (
            <button
              className="btn"
              onClick={() => setStep(step + 1)}
              style={{ flex: 2 }}
            >Avanti</button>
          ) : (
            <button
              className="btn"
              onClick={finish}
              style={{ flex: 2 }}
            >Inizia ✓</button>
          )}
        </div>

        {step === 0 && (
          <button
            onClick={finish}
            style={{
              marginTop: 12, background: 'none', border: 'none',
              color: 'var(--km)', fontSize: 12, cursor: 'pointer',
            }}
          >Salta il tour</button>
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

function PlatformInstructions({ platform }) {
  if (platform === 'ios') {
    return (
      <>
        <p style={{ marginBottom: 10 }}>
          <strong>Su iPhone (Safari):</strong>
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>Tocca il pulsante <strong>Condividi</strong> in basso (📤)</li>
          <li>Scorri e scegli <strong>"Aggiungi alla schermata Home"</strong></li>
          <li>Tocca <strong>Aggiungi</strong> in alto a destra</li>
        </ol>
        <p style={{ marginTop: 10, fontSize: 12, fontStyle: 'italic' }}>
          Dopo, FAMMY si apre come un'app vera e propria.
        </p>
      </>
    );
  }
  if (platform === 'android') {
    return (
      <>
        <p style={{ marginBottom: 10 }}>
          <strong>Su Android (Chrome):</strong>
        </p>
        <ol style={{ paddingLeft: 20, margin: 0 }}>
          <li>Tocca il menu <strong>⋮</strong> in alto a destra</li>
          <li>Scegli <strong>"Installa app"</strong> o <strong>"Aggiungi alla schermata Home"</strong></li>
          <li>Conferma con <strong>Installa</strong></li>
        </ol>
        <p style={{ marginTop: 10, fontSize: 12, fontStyle: 'italic' }}>
          Dopo, FAMMY si apre come un'app vera e propria.
        </p>
      </>
    );
  }
  // Desktop
  return (
    <>
      <p style={{ marginBottom: 10 }}>
        Stai usando FAMMY dal browser desktop. Per la migliore esperienza, apri FAMMY dal telefono e aggiungilo alla schermata Home:
      </p>
      <ul style={{ paddingLeft: 20, margin: 0, fontSize: 13 }}>
        <li><strong>iPhone (Safari):</strong> Condividi → Aggiungi alla Home</li>
        <li><strong>Android (Chrome):</strong> Menu ⋮ → Installa app</li>
      </ul>
    </>
  );
}
