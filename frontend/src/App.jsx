import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { supabase } from './lib/supabase.js';
import { I18nProvider, detectBrowserLang } from './lib/i18n.jsx';
import { applyTheme, getCurrentTheme } from './screens/sub/ThemeScreen.jsx';
import { applyA11ySettings } from './screens/sub/AccessibilityScreen.jsx';
import { useGoogleAvatar } from './lib/useGoogleAvatar.js';
import { usePushSubscription } from './lib/usePushSubscription.js';
import LoginScreen from './screens/LoginScreen.jsx';
import WelcomeScreen from './screens/WelcomeScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import InviteAcceptScreen from './screens/InviteAcceptScreen.jsx';

// Applica preferenze utente (tema + accessibilità) al primo render
applyTheme(getCurrentTheme());
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
  // dataLoaded: true quando abbiamo gia' fatto almeno una fetch di profile+families
  // dopo aver ricevuto la session. Evita il "flash" di WelcomeScreen per utenti
  // esistenti mentre families e' ancora in caricamento.
  const [dataLoaded, setDataLoaded] = useState(false);

  // Salva avatar Google + registra Push subscription
  useGoogleAvatar(session, profile);
  usePushSubscription(session);

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

  const lang = profile?.language || detectBrowserLang();

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
    content = <div className="app-shell"><LoginScreen /></div>;
  } else if (families.length === 0) {
    content = <div className="app-shell"><WelcomeScreen session={session} profile={profile} onCreated={refresh} /></div>;
  } else {
    content = (
      <div className="app-shell">
        <HomeScreen session={session} profile={profile} families={families} onRefresh={refresh} />
      </div>
    );
  }

  return (
    <I18nProvider initialLang={lang}>
      {content}
      <Analytics />
    </I18nProvider>
  );
}
