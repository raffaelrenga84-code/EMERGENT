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
import NamePromptModal from './components/NamePromptModal.jsx';
import AddToHomePrompt from './components/AddToHomePrompt.jsx';
import { shouldShowA2H, incrementVisitCount, markPromptShownThisSession } from './lib/installPrompt.js';

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

// Storage key per "pending invite": dopo l'OAuth/phone signup Supabase
// ridireziona alla Site URL (es. https://farxer.com/) e perde il path
// /invite/:token. Lo salviamo qui per riprenderlo dopo il login.
// TTL: 1 ora — passato questo, lo consideriamo abbandonato per evitare
// che un vecchio invito si auto-attivi su account riusati.
const INVITE_STORAGE_KEY = 'fammy_pending_invite';
const INVITE_TTL_MS = 60 * 60 * 1000; // 1h

function getInviteToken() {
  // 1) Token nel path corrente (caso ingresso fresco da link)
  const m = window.location.pathname.match(/^\/invite\/([^/]+)$/);
  if (m) {
    const token = decodeURIComponent(m[1]);
    try {
      localStorage.setItem(INVITE_STORAGE_KEY, JSON.stringify({ token, ts: Date.now() }));
    } catch { /* ignore */ }
    return token;
  }
  // 2) Token salvato in precedenza (caso ritorno post-OAuth/phone signup)
  try {
    const raw = localStorage.getItem(INVITE_STORAGE_KEY);
    if (!raw) return null;
    const { token, ts } = JSON.parse(raw);
    if (!token || !ts) return null;
    if (Date.now() - ts > INVITE_TTL_MS) {
      localStorage.removeItem(INVITE_STORAGE_KEY);
      return null;
    }
    return token;
  } catch { return null; }
}

function clearPendingInvite() {
  try { localStorage.removeItem(INVITE_STORAGE_KEY); } catch { /* ignore */ }
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
        const parsed = JSON.parse(savedSession);
        // Difesa: non hydratare una session scaduta. Se è scaduta, Supabase
        // farà refresh in getSession() o restituirà null → flusso normale.
        // Senza questo check, fetch members partirebbe con JWT scaduto e
        // RLS valuterebbe auth.uid()=null → utente esistente trattato come nuovo.
        const expiresAt = parsed?.expires_at ? parsed.expires_at * 1000 : 0;
        if (parsed?.user?.id && (!expiresAt || expiresAt > Date.now())) {
          setSession(parsed);
          // 🔑 CRITICO: allinea anche il client Supabase con la session
          // ripristinata. Senza questa chiamata, il client manda le
          // richieste come "anon" → auth.uid() = NULL → tutte le RLS
          // policy che richiedono autenticazione falliscono ("new row
          // violates row-level security policy").
          if (parsed.access_token && parsed.refresh_token) {
            supabase.auth.setSession({
              access_token: parsed.access_token,
              refresh_token: parsed.refresh_token,
            }).catch((e) => console.warn('setSession from localStorage failed:', e));
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Referral amico: se il link era myfammy.app/?ref=<token>, salviamo il
    // token per rivendicarlo al primo login (l'OAuth ricarica la pagina).
    try {
      const refToken = new URLSearchParams(window.location.search).get('ref');
      if (refToken) {
        localStorage.setItem('fammy_pending_ref', refToken);
        // Pulisce l'URL (evita di ri-processare il ref a ogni reload)
        const clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', clean || '/');
      }
    } catch (_) {}

    const claimPendingRef = async () => {
      try {
        const token = localStorage.getItem('fammy_pending_ref');
        if (!token) return;
        await supabase.rpc('claim_friend_invite', { p_token: token });
        localStorage.removeItem('fammy_pending_ref');
      } catch (_) { /* riproveremo al prossimo login */ }
    };

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        localStorage.setItem('fammy_session', JSON.stringify(data.session));
        claimPendingRef();
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) {
        localStorage.setItem('fammy_session', JSON.stringify(s));
        claimPendingRef();
        // Riprende un eventuale invite token salvato: dopo OAuth/phone
        // signup, Supabase ci ridireziona alla home perdendo /invite/:token.
        // Se l'abbiamo salvato in localStorage al primo passaggio, lo
        // ripristiniamo ora che la session è disponibile.
        if (!inviteToken) {
          const t = getInviteToken();
          if (t) setInviteToken(t);
        }
      } else {
        localStorage.removeItem('fammy_session');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // loadError: true se l'ultima fetch di profile/families ha avuto un errore
  // di rete o RLS. In tal caso NON mostriamo WelcomeScreen anche con
  // `families.length === 0`, perché potrebbe essere un falso negativo
  // (utente già iscritto, ma query bloccata da auth.uid() not ready).
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // Difesa: durante l'hydration da localStorage la session potrebbe esistere
    // senza `user` popolato → non basta `if (!session)`, serve verificare user.id
    // per evitare il crash "null is not an object" su session.user.id.
    const userId = session?.user?.id;
    if (!userId) { setProfile(null); setFamilies([]); setDataLoaded(false); setLoadError(false); return; }
    let cancelled = false;
    (async () => {
      let hadError = false;
      try {
        // 🛡️ Safety net: garantisce che la riga in `profiles` per questo
        // user esista PRIMA di toccare families/members. Senza questo, il
        // FK constraint `families_created_by_fkey → profiles(id)` fallisce
        // (errore reale visto in produzione su account con trigger
        // `handle_new_user` mancato/disabilitato in qualche storico).
        // `ignoreDuplicates: true` evita di sovrascrivere dati esistenti.
        try {
          const meta = session?.user?.user_metadata || {};
          const fallbackName = meta.full_name || meta.name
            || session?.user?.email?.split('@')[0]
            || session?.user?.phone
            || 'Membro';
          await supabase.from('profiles').upsert(
            {
              id: userId,
              display_name: fallbackName,
              avatar_letter: String(fallbackName).charAt(0).toUpperCase(),
            },
            { onConflict: 'id', ignoreDuplicates: true }
          );
        } catch (upsertErr) {
          console.warn('Profile upsert safety net failed (non-blocking):', upsertErr);
        }

        const { data: p, error: pErr } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (cancelled) return;
        if (pErr) {
          console.warn('Errore fetch profilo:', pErr);
          hadError = true;
        } else {
          setProfile(p);
        }

        // Retry helper: se la prima query members va in errore (es. token
        // appena ruotato dopo login OAuth, RLS che valuta auth.uid()=null),
        // ritentiamo una volta dopo 800ms.
        const fetchMembers = async () => supabase
          .from('members')
          .select('*, families(*)')
          .eq('user_id', userId);

        let { data: m, error: mErr } = await fetchMembers();
        if (mErr) {
          console.warn('Errore primo fetch members, retry tra 800ms:', mErr);
          await new Promise((r) => setTimeout(r, 800));
          if (cancelled) return;
          const retry = await fetchMembers();
          m = retry.data;
          mErr = retry.error;
        }

        if (cancelled) return;
        if (mErr) {
          console.warn('Errore definitivo fetch members:', mErr);
          hadError = true;
          // Non sovrascriviamo families a [] se avevamo già dati caricati
          // (es. da un refresh): manteniamo lo stato precedente.
        } else {
          // Alias per-membro: se l'utente ha personalizzato nome/emoji/foto
          // della famiglia (members.custom_family_*), qui li sostituiamo nei
          // campi display. I valori reali restano in real_name/real_emoji/
          // real_photo_url. Tutta l'app a valle vede la versione personale.
          const fams = (m || []).map((row) => {
            const f = row.families;
            if (!f) return null;
            return {
              ...f,
              real_name: f.name,
              real_emoji: f.emoji,
              real_photo_url: f.photo_url,
              name: row.custom_family_name || f.name,
              emoji: row.custom_family_emoji || f.emoji,
              photo_url: row.custom_family_photo_url || f.photo_url,
            };
          }).filter(Boolean);
          setFamilies(fams);
        }
      } catch (err) {
        console.warn('Eccezione caricando profile/families:', err);
        hadError = true;
      } finally {
        if (!cancelled) {
          setLoadError(hadError);
          setDataLoaded(true);
        }
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

  // Rileva se il profilo ha ancora un nome "generico" (fallback del trigger):
  //   - vuoto / null
  //   - "Membro" (fallback finale di handle_new_user)
  //   - inizia con "*" seguito da 2-6 cifre (es. "*5531" per phone signup)
  // In tal caso mostriamo un modal obbligatorio "Come ti chiami?" prima di
  // far usare l'app, così la famiglia non vede "*5531" o "Membro" come nome.
  const isGenericName = (n) =>
    !n || n.trim() === '' || n === 'Membro' || /^\*[0-9]{2,6}$/.test(n);
  // Il modal serve in due casi:
  //  a) nome generico (phone signup) → va chiesto, è obbligatorio;
  //  b) nome già valido (Google, o placeholder di famiglia claimato) ma
  //     profilo incompleto: mancano compleanno E indirizzo → chiediamo
  //     SOLO quelli, saltando la domanda sul nome che sappiamo già.
  // Caso (b) una volta sola: se l'utente sceglie "Lo faccio dopo",
  // non lo ripresentiamo (flag locale) — i dati restano compilabili
  // dal Profilo in qualsiasi momento.
  // "Lo faccio dopo" = rinvio di 7 giorni, non un no definitivo: finché
  // il profilo resta incompleto lo riproponiamo con garbo una volta a
  // settimana. Chi compila (address valorizzato) non lo rivede mai più.
  const OB_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
  const obDismissed = (() => {
    try {
      const v = localStorage.getItem('fammy_onboarding_done');
      if (!v) return false;
      if (v === '1') return true;                 // compilato davvero
      const ts = Number(v);
      return Number.isFinite(ts) && (Date.now() - ts) < OB_SNOOZE_MS;
    } catch { return false; }
  })();
  // Profilo incompleto = manca l'indirizzo (proxy semplice e affidabile:
  // il compleanno vive nei members, non nel profilo, e qui non li abbiamo).
  const profileIncomplete = !!profile && !profile.address;
  const showNamePrompt =
    !!session?.user?.id && !!profile && (
      isGenericName(profile.display_name) ||
      (dataLoaded && profileIncomplete && !obDismissed)
    );

  // Strategia di selezione lingua:
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

  // Add-to-Home prompt: mostriamo quando:
  //  - utente autenticato e dati caricati
  //  - non è la prima visita assoluta (visit count >= 3) — l'utente ha dimostrato
  //    di tornare → installazione ha senso, non lo assillo al primo accesso
  //  - non è già installata, non l'ha dismesso negli ultimi 3 giorni
  //  - nessun altro prompt mostrato in questa sessione
  const [showA2H, setShowA2H] = useState(false);
  useEffect(() => {
    // Incrementa visit count una volta sola al boot (se la session arriva)
    if (session?.user?.id) incrementVisitCount();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || !dataLoaded) return;
    // Delay più lungo (~8s) per non sommergere: l'utente ha tempo di guardarsi attorno
    const id = setTimeout(() => {
      if (shouldShowA2H()) {
        markPromptShownThisSession();
        setShowA2H(true);
      }
    }, 8000);
    return () => clearTimeout(id);
  }, [session?.user?.id, dataLoaded]);

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
          onAccepted={() => { clearPendingInvite(); setInviteToken(null); refresh(); }}
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
  } else if (families.length === 0 && loadError) {
    // 🚨 Caso critico: ho session ma la fetch di members ha fallito.
    // NON mostriamo WelcomeScreen (che farebbe credere all'utente di
    // essere un nuovo account e gli farebbe creare una famiglia duplicata).
    // Mostriamo un retry banner amichevole in lingua del device.
    const _t = ({
      it: { title: 'Non riesco a recuperare le tue famiglie', desc: 'Sembra esserci un problema di rete o di sessione. Le tue famiglie e i tuoi dati sono al sicuro: prova a riprovare.', retry: '🔄 Riprova', signout: 'Esci e ri-accedi' },
      en: { title: "Can't load your families", desc: "There's a network or session issue. Your families and data are safe — just try again.", retry: '🔄 Retry', signout: 'Sign out and log back in' },
      fr: { title: 'Impossible de charger vos familles', desc: 'Problème de réseau ou de session. Vos familles et vos données sont en sécurité : réessayez.', retry: '🔄 Réessayer', signout: 'Se déconnecter et se reconnecter' },
      de: { title: 'Familien können nicht geladen werden', desc: 'Es gibt ein Netzwerk- oder Sitzungsproblem. Deine Familien und Daten sind sicher — versuche es erneut.', retry: '🔄 Erneut versuchen', signout: 'Abmelden und wieder anmelden' },
    })[browserLang] || ({
      title: "Can't load your families", desc: "Network or session issue. Your data is safe — try again.", retry: '🔄 Retry', signout: 'Sign out',
    });
    content = (
      <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
          <h2 style={{ fontFamily: 'var(--fs)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            {_t.title}
          </h2>
          <p style={{ color: 'var(--km)', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
            {_t.desc}
          </p>
          <button
            className="btn full"
            data-testid="reload-families-btn"
            onClick={refresh}
            style={{ marginBottom: 12 }}>
            {_t.retry}
          </button>
          <button
            className="link-btn"
            data-testid="signout-fallback-btn"
            onClick={() => supabase.auth.signOut()}
            style={{ color: 'var(--km)' }}>
            {_t.signout}
          </button>
        </div>
      </div>
    );
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
      {showNamePrompt && (
        <NamePromptModal
          session={session}
          profile={profile}
          nameKnown={!isGenericName(profile.display_name)}
          onSaved={() => {
            // '1' = completato: non riproporre mai più. Il rinvio a 7 giorni
            // viene invece scritto dal modal stesso come timestamp.
            try {
              const cur = localStorage.getItem('fammy_onboarding_done');
              if (cur !== String(Number(cur))) localStorage.setItem('fammy_onboarding_done', '1');
            } catch { /* ignore */ }
            refresh();
          }}
        />
      )}
      {showA2H && (
        <AddToHomePrompt onClose={() => setShowA2H(false)} />
      )}
      {consent === 'all' && <Analytics />}
    </I18nProvider>
  );
}
