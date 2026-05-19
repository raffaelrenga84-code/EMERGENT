import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT, LANGS } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import FamilyMemoriesCard from '../../components/FamilyMemoriesCard.jsx';
import InviteStatsCard from '../../components/InviteStatsCard.jsx';
import OnboardingTour from '../../components/OnboardingTour.jsx';
import QuietHoursControl from '../../components/QuietHoursControl.jsx';
import PricingScreen from '../sub/PricingScreen.jsx';
import ThemeScreen from '../sub/ThemeScreen.jsx';
import AccessibilityScreen from '../sub/AccessibilityScreen.jsx';
import DataPrivacyScreen from '../sub/DataPrivacyScreen.jsx';

const COLORS = ['#1C1611', '#2A6FDB', '#C96A3A', '#2E7D52', '#9B59B6', '#E91E8C', '#E67E22', '#7C3AED', '#5A4A3A', '#8B6F5E'];

export default function ProfileTab({ session, profile, families = [], members = [], me, onChanged, notificationControl = {} }) {
  const { t, lang, setLang } = useT();
  const [view, setView] = useState('main'); // main | plans | theme | a11y | privacy
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile?.display_name || '');
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [birthday, setBirthday] = useState(profile?.birthday || '');
  const [editingColor, setEditingColor] = useState(false);
  const [color, setColor] = useState(profile?.avatar_color || '#1C1611');
  const [busy, setBusy] = useState(false);
  const [showTour, setShowTour] = useState(false);

  if (view === 'plans') return <PricingScreen onBack={() => setView('main')} />;
  if (view === 'theme') return <ThemeScreen onBack={() => setView('main')} />;
  if (view === 'a11y') return <AccessibilityScreen onBack={() => setView('main')} />;
  if (view === 'privacy') return <DataPrivacyScreen session={session} onBack={() => setView('main')} />;

  const saveName = async () => {
    if (!name.trim() || name === profile?.display_name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    await supabase.from('profiles').update({
      display_name: name.trim(),
      avatar_letter: name.trim().charAt(0).toUpperCase(),
    }).eq('id', session.user.id);
    onChanged && onChanged();
    setBusy(false);
    setEditingName(false);
  };

  const saveBirthday = async () => {
    if (birthday === profile?.birthday) {
      setEditingBirthday(false);
      return;
    }
    setBusy(true);

    // Salva il compleanno nel profilo
    await supabase.from('profiles').update({ birthday: birthday || null }).eq('id', session.user.id);

    // Salva il compleanno anche in tutti i members dell'utente (per le notifiche)
    await supabase.from('members').update({ birth_date: birthday || null }).eq('user_id', session.user.id);

    onChanged && onChanged();
    setBusy(false);
    setEditingBirthday(false);
  };

  const saveColor = async (c) => {
    setColor(c);
    setBusy(true);
    await supabase.from('profiles').update({ avatar_color: c }).eq('id', session.user.id);
    onChanged && onChanged();
    setBusy(false);
  };

  const changeLang = async (newLang) => {
    setLang(newLang);
    if (profile?.id) {
      await supabase.from('profiles').update({ language: newLang }).eq('id', session.user.id);
      onChanged && onChanged();
    }
  };

  const shareApp = async () => {
    const url = window.location.origin;
    // Bug fix: prima il `text` conteneva {url} interpolato, e poi `navigator.share`
    // aggiungeva ANCHE `url` come campo separato → su WhatsApp appariva 2 volte.
    // Soluzione: 2 versioni del messaggio, una "stand-alone" per clipboard
    // (con url inline), l'altra per navigator.share (senza url nel text, perché
    // il sistema operativo appende url).
    const messageWithUrl = t('profile_referral_msg', { url });
    const messageBare = t('profile_referral_msg', { url: '' }).replace(/[\s:]*$/, '');
    if (navigator.share) {
      try { await navigator.share({ title: 'FAMMY', text: messageBare, url }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(messageWithUrl); alert(t('share_copied')); } catch {}
    }
  };

  const initial = (profile?.avatar_letter || (profile?.display_name || 'U').charAt(0)).toUpperCase();

  return (
    <div className="profile-wrap">
      <h1 className="profile-h">{t('profile_h')}</h1>

      {/* Avatar */}
      <div className="profile-section">
        <div className="profile-row">
          <div>
            <div className="profile-label">{t('profile_avatar')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <Avatar
                name={profile?.display_name}
                avatarUrl={profile?.avatar_url}
                avatarLetter={initial}
                avatarColor={color}
                size={64}
              />
            </div>
          </div>
          <button className="profile-btn" onClick={() => setEditingColor(!editingColor)}>
            {editingColor ? t('close') : t('profile_change_color')}
          </button>
        </div>
        {editingColor && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => saveColor(c)}
                style={{
                  width: 32, height: 32, borderRadius: 10, background: c,
                  border: color === c ? '3px solid var(--k)' : '1.5px solid var(--sm)',
                }} />
            ))}
          </div>
        )}
      </div>

      {/* Nome */}
      <div className="profile-section">
        <div className="profile-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-label">{t('profile_name')}</div>
            {editingName ? (
              <input className="input" autoFocus
                value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setName(profile?.display_name || ''); setEditingName(false); } }} />
            ) : (
              <div className="profile-value">{profile?.display_name}</div>
            )}
          </div>
          {editingName ? (
            <button className="profile-btn primary" onClick={saveName} disabled={busy}>
              {busy ? <span className="spin" /> : t('save')}
            </button>
          ) : (
            <button className="profile-btn" onClick={() => setEditingName(true)}>
              {t('profile_modify')}
            </button>
          )}
        </div>
      </div>

      {/* Compleanno */}
      <div className="profile-section">
        <div className="profile-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-label">🎂 {t('birthday')}</div>
            {editingBirthday ? (
              <input type="date" className="input" autoFocus
                value={birthday} onChange={(e) => setBirthday(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveBirthday(); if (e.key === 'Escape') { setBirthday(profile?.birthday || ''); setEditingBirthday(false); } }} />
            ) : (
              <div className="profile-value">{birthday ? new Date(birthday).toLocaleDateString(lang === 'it' ? 'it-IT' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : t('not_set')}</div>
            )}
          </div>
          {editingBirthday ? (
            <button className="profile-btn primary" onClick={saveBirthday} disabled={busy}>
              {busy ? <span className="spin" /> : t('save')}
            </button>
          ) : (
            <button className="profile-btn" onClick={() => setEditingBirthday(true)}>
              {t('profile_modify')}
            </button>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="profile-section">
        <div className="profile-row">
          <div>
            <div className="profile-label">{t('profile_email')}</div>
            <div className="profile-value" style={{ color: 'var(--km)' }}>{session.user.email}</div>
          </div>
        </div>
      </div>

      {/* Lingua */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>{t('profile_language')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LANGS.map((l) => (
            <button key={l.id} onClick={() => changeLang(l.id)}
              style={{
                padding: '8px 14px', borderRadius: 100, border: '1.5px solid',
                borderColor: lang === l.id ? 'var(--k)' : 'var(--sm)',
                background: lang === l.id ? 'var(--sm)' : 'white',
                fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
              }}>
              <span style={{ fontSize: 16 }}>{l.flag}</span> {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Family Memories — galleria mensile auto delle foto */}
      {families.length > 0 && (
        <div className="profile-section">
          <FamilyMemoriesCard families={families} members={members} me={me} />
        </div>
      )}

      {/* Notifiche Push */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 12 }}>{t('notifications_push_h')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Status attuale */}
          <div style={{
            padding: 12,
            background: 'var(--s)',
            borderRadius: 12,
            border: '1px solid var(--sm)',
            fontSize: 13,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>{t('notif_perm_status')}</span>
              <span style={{
                padding: '2px 8px',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 700,
                background: notificationControl.notificationPermission === 'granted' ? 'var(--gnB)' : 'var(--rdB)',
                color: notificationControl.notificationPermission === 'granted' ? 'var(--gn)' : 'var(--rd)',
              }}>
                {notificationControl.notificationPermission === 'granted' ? t('notif_enabled') : t('notif_not_enabled')}
              </span>
            </div>
            {notificationControl.notificationPermission === 'default' && (
              <button
                className="btn full secondary"
                style={{ fontSize: 13, padding: '10px 12px', marginTop: 8 }}
                onClick={() => notificationControl.requestPermission?.()}
              >
                {t('notif_enable_btn')}
              </button>
            )}
            {notificationControl.notificationPermission === 'denied' && (
              <div style={{ marginTop: 12 }}>
                <button
                  className="btn full secondary"
                  style={{ fontSize: 13, padding: '10px 12px', marginBottom: 10 }}
                  onClick={() => notificationControl.requestPermission?.()}
                >
                  {t('notif_retry_btn')}
                </button>
                <div
                  style={{ fontSize: 12, color: 'var(--km)', lineHeight: 1.5, padding: 10, background: 'var(--rdB)', borderRadius: 8, border: '1px solid var(--rd)' }}
                  dangerouslySetInnerHTML={{ __html: t('notif_ios_denied_block') }}
                />
              </div>
            )}
          </div>

          {/* Toggle notifiche */}
          {notificationControl.notificationPermission === 'granted' && (
            <NotificationToggle
              enabled={notificationControl.notificationsEnabled ?? true}
              onChange={(enabled) => notificationControl.setNotificationsEnabled?.(enabled)}
            />
          )}

          {/* Test push notification */}
          {notificationControl.notificationPermission === 'granted' && (
            <TestPushButton session={session} />
          )}

          {/* Quiet Hours - non disturbare 22-07 */}
          {notificationControl.notificationPermission === 'granted' && (
            <QuietHoursControl />
          )}

          {/* Info */}
          <p
            style={{ fontSize: 12, color: 'var(--km)', lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: t('notif_info_30min') + '<br/>' + t('notif_info_immediate') }}
          />
        </div>
      </div>

      {/* Settings menu (Plans, Theme, A11y) */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>{t('profile_settings_h')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SettingRow label={t('profile_plans')} onClick={() => setView('plans')} accent />
          <SettingRow label={t('profile_theme')} onClick={() => setView('theme')} />
          <SettingRow label={t('profile_accessibility')} onClick={() => setView('a11y')} />
          <SettingRow label={t('profile_privacy')} onClick={() => setView('privacy')} />
        </div>
      </div>

      {/* Referral / share FAMMY */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 4 }}>{t('profile_referral_h')}</div>

        {/* Mini-stat: quanti hanno joinato la famiglia questa settimana */}
        <InviteStatsCard session={session} families={families} />

        <p style={{ fontSize: 13, color: 'var(--km)', margin: '0 0 12px', lineHeight: 1.4 }}>
          {t('profile_referral_sub')}
        </p>
        <button className="btn full" onClick={shareApp} data-testid="profile-referral-btn">{t('profile_referral_btn')}</button>
        <p style={{ fontSize: 11, color: 'var(--km)', margin: '10px 4px 0', lineHeight: 1.45, textAlign: 'center' }}>
          💡 {t('invite_hint_family')} <strong>Famiglia → 💌</strong>.
        </p>
      </div>

      {/* Riguarda il tour */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>🎓 {t('profile_tour_label')}</div>
        <button
          type="button"
          className="btn full secondary"
          onClick={() => setShowTour(true)}
          data-testid="profile-show-tour-btn"
        >
          {t('profile_tour_btn')}
        </button>
      </div>

      <div className="profile-section" style={{ borderBottom: 'none' }}>
        <button className="btn full danger" onClick={() => supabase.auth.signOut()}>{t('logout')}</button>
        <p style={{ fontSize: 11, color: 'var(--km)', textAlign: 'center', marginTop: 16, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {t('profile_app_info')}
        </p>
      </div>

      {showTour && (
        <OnboardingTour onClose={() => setShowTour(false)} />
      )}
    </div>
  );
}

function SettingRow({ label, onClick, accent }) {
  return (
    <button onClick={onClick} className="setting-row" style={accent ? { borderColor: 'var(--am)', background: 'var(--amB)' } : {}}>
      <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>{label}</span>
      <span style={{ color: 'var(--kl)', fontSize: 18 }}>›</span>
    </button>
  );
}

function NotificationToggle({ enabled, onChange }) {
  const { t } = useT();
  return (
    <div style={{
      padding: 12,
      background: enabled ? 'var(--gnB)' : 'var(--rdB)',
      borderRadius: 12,
      border: '1px solid ' + (enabled ? 'var(--gn)' : 'var(--rd)'),
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--k)', marginBottom: 2 }}>
          {enabled ? t('notif_active') : t('notif_inactive')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--km)' }}>
          {enabled ? t('notif_active_sub') : t('notif_inactive_sub')}
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        style={{
          padding: '8px 16px',
          borderRadius: 100,
          border: 'none',
          background: enabled ? 'var(--gn)' : 'var(--rd)',
          color: 'white',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {enabled ? t('notif_deactivate') : t('notif_activate')}
      </button>
    </div>
  );
}


function TestPushButton({ session }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const sendTest = async () => {
    if (!session?.user?.id) return;
    setBusy(true); setMsg('');
    try {
      // Recupera il token utente per autenticare la chiamata
      const { data: { session: s } } = await supabase.auth.getSession();
      const token = s?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          user_id: session.user.id,
          title: '🎉 Test FAMMY',
          body: 'Le push notifications funzionano correttamente!',
          tag: 'test-push',
        }),
      });
      const data = await res.json();
      if (data.sent && data.sent > 0) {
        setMsg(`✅ Inviata a ${data.sent} dispositiv${data.sent === 1 ? 'o' : 'i'}.`);
      } else if (data.reason === 'no_subscriptions') {
        setMsg('⚠️ Nessuna subscription registrata. Ricarica la pagina dopo aver concesso il permesso notifiche.');
      } else {
        setMsg(`⚠️ ${data.error || 'Nessuna notifica inviata.'} Verifica che le Edge Function siano deployate.`);
      }
    } catch (e) {
      setMsg(`❌ Errore: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      padding: 12, background: 'var(--ab)', borderRadius: 12,
      border: '1px solid var(--sd)',
    }}>
      <button onClick={sendTest} disabled={busy}
        data-testid="profile-test-push-btn"
        className="btn full secondary"
        style={{ fontSize: 13, padding: '10px 14px' }}>
        {busy ? <span className="spin dark" /> : '🔔 Invia notifica di test'}
      </button>
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--km)', lineHeight: 1.4 }}>{msg}</div>}
    </div>
  );
}
