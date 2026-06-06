import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { supabase } from './lib/supabase.js';
import { I18nProvider, detectBrowserLang, userHasChosenLang } from './lib/i18n.jsx';
import { applyTheme, getCurrentTheme, initThemeAutoListener } from './screens/sub/ThemeScreen.jsx';
import { applyA11ySettings } from './screens/sub/AccessibilityScreen.jsx';
import { useGoogleAvatar } from './lib/useGoogleAvatar.js';
import { usePushSubscription } from './lib/usePushSubscription.js';
import { useAppBadgeClear } from './lib/useAppBadge.js';
import LoginScreen from './screens/LoginScreen.jsx';
import WelcomeScreen from './screens/WelcomeScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import InviteAcceptScreen from './screens/InviteAcceptScreen.jsx';
import CookieConsentBanner, { getConsent } from './components/CookieConsentBanner.jsx';
import PrivacyPolicyModal from './components/PrivacyPolicyModal.jsx';
import ToastListener from './components/ToastListener.jsx';
import DesktopLanding from './screens/DesktopLanding.jsx';
import BackupGoogleModal, { shouldShowBackupGoogle } from './components/BackupGoogleModal.jsx';

// Riconosce un device "desktop puro" (no touch, mouse, schermo grande).
// Tablet / iPad rimangono mobile-mode perché supportano touch.
// Combiniamo viewport + user-agent + pointer per evitare falsi positivi
// (es. Playwright headless che riporta pointer:fine anche con viewport mobile).
function isDesktopDevice() {
  if (typeof window === 'undefined') return false;
  // Override esplicito via querystring per testing: ?desktop=1 / ?mobile=1
  const qs = new URLSearchParams(window.location.search);
  if (qs.get('mobile') === '1') return false;
  if (qs.get('desktop') === '1') return true;
  // User-agent mobile → sempre mobile, anche su viewport ridimensionata
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|Android.*Mobile|Mobile.*Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return false;
  }
  // iPad recenti mandano UA macOS: distinguiamo via touch
  if (/iPad|Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1) {
    return false;
  }
  if (window.innerWidth < 768) return false;
  const wideViewport = window.innerWidth >= 1024;
  const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  const noTouch = !('ontouchstart' in window) && (navigator.maxTouchPoints || 0) === 0;
  return wideViewport && finePointer && noTouch;
}

// Applica preferenze utente (tema + accessibilità) al primo render
applyTheme(getCurrentTheme());
initThemeAutoListener();
applyA11ySettings();

function getInviteToken() {
  const m = window.location.pathname.match(/^\/invite\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [families, setFamilies] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [inviteToken, setInviteToken] = useState(getInviteToken());
  // GDPR: consenso cookie e modal privacy (entrambi accessibili anche da loggati e non).
  const [consent, setConsent] = useState(() => getConsent());
  const [showPrivacy, setShowPrivacy] = useState(false);
  // Backup Google: una sola volta dopo il login phone-only.
  const [showBackupGoogle, setShowBackupGoogle] = useState(false);
  // dataLoaded: true quando abbiamo gia' fatto almeno una fetch di profile+families
  // dopo aver ricevuto la session. Evita il "flash" di WelcomeScreen per utenti
  // esistenti mentre families e' ancora in caricamento.
  const [dataLoaded, setDataLoaded] = useState(false);
  // Desktop landing: mostra la pagina marketing solo per utenti NON loggati
  // su un device desktop. L'utente può sempre forzare l'accesso "desktop"
  // tramite il link in fondo alla landing (salvato in localStorage).
  const [forceDesktop, setForceDesktop] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('fammy_force_desktop') === '1'
  );
  const isDesktop = isDesktopDevice();

  // Salva avatar Google + registra Push subscription
  useGoogleAvatar(session, profile);
  usePushSubscription(session);
  // Pulisce il badge rosso sull'icona quando l'app è in primo piano
  useAppBadgeClear();

  useEffect(() => {
    const savedSession = localStorage.getItem('fammy_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        setSession(session);
      } catch (e) {}
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        localStorage.setItem('fammy_session', JSON.stringify(data.session));
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        localStorage.setItem('fammy_session', JSON.stringify(s));
      } else {
        localStorage.removeItem('fammy_session');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null); setFamilies([]); setDataLoaded(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
        if (cancelled) return;
        setProfile(p);

        const { data: m } = await supabase
          .from('members')
          .select('family_id, families(*)')
          .eq('user_id', session.user.id);
        if (cancelled) return;
        const fams = (m || []).map((row) => row.families).filter(Boolean);
        setFamilies(fams);
      } catch (err) {
        console.warn('Errore caricando profile/families:', err);
      } finally {
        if (!cancelled) setDataLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [session, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Backup-Google nudge: dopo che la session è caricata e profile pronto,
  // valutiamo se l'utente è "phone-only" (nessuna identity Google linkata).
  // In tal caso, mostriamo il modale una sola volta (segna "dismissed" in
  // localStorage al click "Più tardi"). Vedi `shouldShowBackupGoogle`.
  useEffect(() => {
    if (!session || !dataLoaded) return;
    if (families.length === 0) return; // aspetta che l'onboarding sia finito
    if (shouldShowBackupGoogle(session)) {
      // Piccolo delay per non sovrapporsi alla home appena renderizzata
      const id = setTimeout(() => setShowBackupGoogle(true), 1500);
      return () => clearTimeout(id);
    }
  }, [session, dataLoaded, families.length]);

  // Optimistic update — sostituisce la famiglia aggiornata nello state
  // senza aspettare il round-trip a Supabase. Garantisce che la foto/emoji/nome
  // si veda subito in FamilySwitcher, FamilyTab e ovunque legga `families`.
  const updateFamilyLocally = (updated) => {
    if (!updated || !updated.id) return;
    setFamilies((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
  };

  // Strategia di selezione lingua:
  // - Se l'utente ha cliccato esplicitamente una bandiera (in qualsiasi schermo),
  //   onoriamo la sua scelta salvata in profile.language
  // - Altrimenti seguiamo SEMPRE la lingua del browser. Necessario perché
  //   profiles.language ha DEFAULT 'it' nel DB → tutti i nuovi utenti
  //   nascono con 'it' anche se in Australia/USA/Germania/ecc.
  const browserLang = detectBrowserLang();
  const lang = userHasChosenLang() && profile?.language ? profile.language : browserLang;

  // Sync lazy DB: se l'utente non ha mai scelto una lingua e il DB ha un valore
  // diverso da quello del browser, allineiamo silenziosamente. Così notifiche
  // server-side (push digest, email settimanale, inviti) usano la lingua giusta.
  useEffect(() => {
    if (!profile?.id) return;
    if (userHasChosenLang()) return;
    if (!profile.language || profile.language === browserLang) return;
    supabase.from('profiles')
      .update({ language: browserLang })
      .eq('id', profile.id)
      .then(() => { /* fire-and-forget */ }, () => { /* fire-and-forget */ });
  }, [profile?.id, profile?.language, browserLang]);

  let content;
  if (loading || (session && !dataLoaded)) {
    content = (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span className="spin dark" />
      </div>
    );
  } else if (inviteToken) {
    content = (
      <div className="app-shell">
        <InviteAcceptScreen
          token={inviteToken}
          session={session}
          onAccepted={() => { setInviteToken(null); refresh(); }}
        />
      </div>
    );
  } else if (!session) {
    // Desktop landing solo se: PC, NON loggato, NON c'è invite token, e
    // l'utente non ha già forzato il bypass.
    if (isDesktop && !forceDesktop && !inviteToken) {
      content = (
        <DesktopLanding onContinueAnyway={() => {
          localStorage.setItem('fammy_force_desktop', '1');
          setForceDesktop(true);
        }} />
      );
    } else {
      content = <div className="app-shell"><LoginScreen /></div>;
    }
  } else if (families.length === 0) {
    content = <div className="app-shell"><WelcomeScreen session={session} profile={profile} onCreated={refresh} /></div>;
  } else {
    content = (
      <div className="app-shell">
        <HomeScreen session={session} profile={profile} families={families} onRefresh={refresh} onFamilyUpdated={updateFamilyLocally} />
      </div>
    );
  }

  return (
    <I18nProvider initialLang={lang}>
      {content}
      <ToastListener />
      <CookieConsentBanner
        onChange={(v) => setConsent(v)}
        onOpenPrivacy={() => setShowPrivacy(true)}
      />
      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showBackupGoogle && session?.user?.id && (
        <BackupGoogleModal
          userId={session.user.id}
          onClose={() => setShowBackupGoogle(false)}
        />
      )}
      {consent === 'all' && <Analytics />}
    </I18nProvider>
  );
}
