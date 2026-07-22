import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';

const LANG_LABELS = [
  { code: 'it', flag: '🇮🇹', label: 'IT' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'fr', flag: '🇫🇷', label: 'FR' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
];

/**
 * DesktopLanding — landing page mostrata solo a chi visita FAMMY da desktop
 * senza essere loggato. FAMMY è un'app pensata per mobile (PWA installabile),
 * quindi su schermi grandi mostriamo un teaser di marketing che invita a
 * continuare dal telefono — ma lasciamo comunque un'uscita "Apri qui sul
 * browser" per chi è in viaggio / lavora da PC.
 *
 * Si scopre essere desktop con un combo di check su:
 *  - viewport width >= 1024
 *  - touch === false (no tablet)
 *  - pointer === fine (mouse)
 *
 * Lingua: rilevata automaticamente da navigator.language tramite l'I18nProvider
 * di App.jsx. L'utente può forzarla con i flag in alto a destra.
 */
export default function DesktopLanding({ onContinueAnyway }) {
  const { t, lang, setLang } = useT();
  const appUrl = window.location.origin;
  const [showQR, setShowQR] = useState(false);

  return (
    <div
      data-testid="desktop-landing"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #FAF4ED 0%, #F0E6D7 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        position: 'relative',
      }}>
      {/* Language switcher in alto a destra. La lingua iniziale è già auto-
          rilevata da navigator.language; questo permette comunque l'override
          manuale (es. browser in inglese, ma l'utente preferisce l'italiano). */}
      <div style={{
        position: 'absolute', top: 20, right: 24,
        display: 'flex', gap: 6,
        background: 'white', padding: '6px 8px',
        borderRadius: 100, border: '1px solid var(--sm)',
        boxShadow: '0 2px 8px rgba(28,22,17,0.05)',
        zIndex: 10,
      }} data-testid="dl-lang-switcher">
        {LANG_LABELS.map((l) => {
          const active = lang === l.code;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              data-testid={`dl-lang-${l.code}`}
              aria-label={l.label}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 100,
                border: 'none',
                background: active ? 'var(--k)' : 'transparent',
                color: active ? 'white' : 'var(--km)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.03em',
                transition: 'background 0.15s, color 0.15s',
              }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 480px) minmax(280px, 360px)',
        gap: 64,
        alignItems: 'center',
        maxWidth: 1100,
        width: '100%',
      }} className="dl-grid">

        {/* COLONNA SX: Hero copy + CTA */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 100,
            background: 'white', border: '1px solid var(--sm)',
            fontSize: 12, fontWeight: 700, color: 'var(--ac)',
            letterSpacing: '0.05em', textTransform: 'uppercase',
            marginBottom: 24,
          }}>
            <span style={{ fontSize: 14 }}>🏡</span> FAMMY
          </div>

          <h1 style={{
            fontFamily: 'var(--fs)',
            fontSize: 'clamp(40px, 4.5vw, 60px)',
            lineHeight: 1.05,
            margin: '0 0 18px',
            letterSpacing: '-0.02em',
            color: 'var(--k)',
          }}>
            {t('dl_hero_h1') || 'La tua famiglia,'}
            <br />
            <span style={{ color: 'var(--ac)' }}>
              {t('dl_hero_h1_accent') || 'finalmente organizzata.'}
            </span>
          </h1>

          <p style={{
            fontSize: 17, lineHeight: 1.55, color: 'var(--km)',
            margin: '0 0 28px', maxWidth: 460,
          }}>
            {t('dl_hero_p') || 'Incarichi, agenda, spese e chat di famiglia in un\'unica app. Niente più conversazioni infinite per ricordarsi chi compra il pane.'}
          </p>

          {/* Lista feature concise */}
          <ul style={{
            listStyle: 'none', padding: 0, margin: '0 0 36px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {[
              { e: '📋', t: t('dl_feat_tasks')    || 'Incarichi condivisi con chat per ogni task' },
              { e: '📅', t: t('dl_feat_calendar') || 'Agenda con sync Apple & Google Calendar' },
              { e: '💸', t: t('dl_feat_expenses') || 'Spese divise, anche a rate parziali' },
              { e: '✈️', t: t('dl_feat_absences') || 'Assenze: vedi chi c\'è in famiglia oggi' },
            ].map((f) => (
              <li key={f.e} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 15, color: 'var(--k)', fontWeight: 500,
              }}>
                <span style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: 'white', border: '1px solid var(--sm)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{f.e}</span>
                {f.t}
              </li>
            ))}
          </ul>

          {/* CTA principale: mobile-first */}
          <div style={{
            padding: 20, borderRadius: 18,
            background: 'white', border: '1.5px solid var(--sm)',
            boxShadow: '0 8px 24px rgba(28,22,17,0.06)',
            maxWidth: 460,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ fontSize: 28 }}>📱</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {t('dl_cta_h') || 'Apri FAMMY dal telefono'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--km)', marginTop: 2 }}>
                  {t('dl_cta_p') || 'Pensata per il mobile: installala come app dal tuo browser.'}
                </div>
              </div>
            </div>
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--ab)', border: '1px solid var(--sm)',
              fontFamily: 'ui-monospace, monospace', fontSize: 13, fontWeight: 600,
              color: 'var(--k)', wordBreak: 'break-all', marginBottom: 12,
            }}>
              {appUrl}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="dl-qr-toggle"
                onClick={() => setShowQR((v) => !v)}
                style={{
                  flex: 1, minWidth: 160,
                  padding: '12px 16px', borderRadius: 12,
                  background: 'var(--ac)', color: 'white', border: 'none',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                <span>📷</span>
                {showQR ? (t('dl_qr_hide') || 'Nascondi QR') : (t('dl_qr_show') || 'Mostra QR per il mobile')}
              </button>
              <button
                type="button"
                data-testid="dl-copy-link"
                onClick={() => {
                  navigator.clipboard?.writeText(appUrl);
                  window.dispatchEvent(new CustomEvent('fammy_toast', {
                    detail: { text: '🔗 Link copiato', tone: 'success' },
                  }));
                }}
                style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: 'white', color: 'var(--k)',
                  border: '1.5px solid var(--sm)',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                🔗 {t('dl_copy_link') || 'Copia link'}
              </button>
            </div>

            {showQR && (
              <div style={{
                marginTop: 14, padding: 14, borderRadius: 12,
                background: 'var(--ab)', textAlign: 'center',
              }}>
                <img
                  alt="QR FAMMY"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(appUrl)}`}
                  style={{
                    width: 200, height: 200, borderRadius: 10,
                    background: 'white', padding: 6,
                  }}
                  data-testid="dl-qr-image"
                />
                <div style={{
                  marginTop: 8, fontSize: 12, color: 'var(--km)',
                }}>
                  {t('dl_qr_hint') || 'Inquadra con la fotocamera del telefono'}
                </div>
              </div>
            )}
          </div>

          {/* Badge store */}
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            {/* Android: Google Play */}
            <a href="https://play.google.com/store/apps/details?id=app.myfammy.twa"
              target="_blank" rel="noopener"
              data-testid="dl-badge-android"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 12,
                background: '#1C1611', color: 'white', textDecoration: 'none',
                border: 'none', cursor: 'pointer',
              }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.224a1 1 0 010 1.034l-2.006 1.16L13.4 12l2.293-2.293 2.005 1.776zM5.864 3.658L16.8 9.99l-2.302 2.302-8.635-8.634z"/>
              </svg>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 10, opacity: 0.8 }}>{t('dl_badge_android_sub') || 'Disponibile su'}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Google Play</div>
              </div>
            </a>

            {/* iOS: guida installazione */}
            <a href="/ios-install.html"
              target="_blank" rel="noopener"
              data-testid="dl-badge-ios"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 12,
                background: '#1C1611', color: 'white', textDecoration: 'none',
              }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontSize: 10, opacity: 0.8 }}>{t('dl_badge_ios_sub') || 'Su iPhone'}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Guida installazione</div>
              </div>
            </a>
          </div>

          {/* Uscita: continua su desktop */}
          <button
            type="button"
            data-testid="dl-continue-desktop"
            onClick={onContinueAnyway}
            style={{
              marginTop: 18, padding: 0, border: 'none',
              background: 'transparent', color: 'var(--km)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: 4,
            }}>
            {t('dl_continue_desktop') || 'Continua qui dal browser desktop →'}
          </button>
        </div>

        {/* COLONNA DX: Mockup smartphone */}
        <div style={{ display: 'flex', justifyContent: 'center' }} className="dl-mockup">
          <div style={{
            width: 280, height: 580, borderRadius: 44,
            background: '#1C1611', padding: 12,
            boxShadow: '0 32px 64px rgba(28,22,17,0.18), 0 12px 24px rgba(28,22,17,0.1)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: 18, left: '50%', transform: 'translateX(-50%)',
              width: 90, height: 22, borderRadius: 100, background: '#000',
              zIndex: 2,
            }} />
            <div style={{
              width: '100%', height: '100%', borderRadius: 34,
              background: '#FAF4ED', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Mock content */}
              <div style={{ padding: '60px 18px 14px' }}>
                <div style={{ fontSize: 12, color: 'var(--km)', fontWeight: 600 }}>
                  🏡 Famiglia Rossi · 3 da fare
                </div>
                <div style={{ fontFamily: 'var(--fs)', fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                  Bacheca
                </div>
              </div>
              {/* Mock cards */}
              <div style={{ flex: 1, padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                {[
                  { e: '🛒', h: 'Spesa al super', t: 'Mamma', c: '#E7C9B5' },
                  { e: '🏥', h: 'Visita pediatra', t: 'Papà', c: '#D6E4D7' },
                  { e: '🎂', h: 'Torta per Sofia', t: 'Tutti', c: '#F4DCDC' },
                  { e: '🚗', h: 'Cambio gomme', t: 'Marco', c: '#E0DCE8' },
                ].map((c, i) => (
                  <div key={i} style={{
                    padding: 12, borderRadius: 14,
                    background: 'white', border: '1px solid var(--sm)',
                    display: 'flex', alignItems: 'center', gap: 10,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: c.c, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 18, flexShrink: 0,
                    }}>{c.e}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{c.h}</div>
                      <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 1 }}>
                        Assegnato a {c.t}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Mock bottom nav */}
              <div style={{
                height: 60, borderTop: '1px solid var(--sm)',
                background: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                fontSize: 18,
              }}>
                <span>🏠</span><span>📅</span><span>💸</span><span>👥</span><span>👤</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS responsive: stack su tablet */}
      <style>{`
        @media (max-width: 900px) {
          .dl-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .dl-mockup { order: -1; }
        }
      `}</style>
    </div>
  );
}
