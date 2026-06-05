import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT, LANGS } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import FamilyMemoriesCard from '../../components/FamilyMemoriesCard.jsx';
import InviteStatsCard from '../../components/InviteStatsCard.jsx';
import OnboardingTour from '../../components/OnboardingTour.jsx';
import QuietHoursControl from '../../components/QuietHoursControl.jsx';
import WeeklySummaryCard from '../../components/WeeklySummaryCard.jsx';
import WeeklyEmailSyncToggle from '../../components/WeeklyEmailSyncToggle.jsx';
import PricingScreen from '../sub/PricingScreen.jsx';
import ThemeScreen from '../sub/ThemeScreen.jsx';
import AccessibilityScreen from '../sub/AccessibilityScreen.jsx';
import DataPrivacyScreen from '../sub/DataPrivacyScreen.jsx';
import ImportScheduleModal from '../../components/ImportScheduleModal.jsx';
import ProfilePhoneCard from '../../components/ProfilePhoneCard.jsx';
import MergeAccountModal from '../../components/MergeAccountModal.jsx';
import MedicationsModal from '../../components/MedicationsModal.jsx';

const COLORS = ['#1C1611', '#2A6FDB', '#C96A3A', '#2E7D52', '#9B59B6', '#E91E8C', '#E67E22', '#7C3AED', '#5A4A3A', '#8B6F5E'];

export default function ProfileTab({ session, profile, families = [], members = [], me, tasks = [], events = [], activeFamilyId = null, onChanged, notificationControl = {} }) {
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
  const [showImportSchedule, setShowImportSchedule] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  // Membri "me" (uno per ogni famiglia a cui appartengo). Uso il primo
  // come riferimento per Care Hub. Il toggle assistito li aggiorna tutti.
  const myMembers = (members || []).filter((m) => m.user_id === session.user.id);
  const iAmAssisted = myMembers.some((m) => m.is_assisted);
  const [savingAssisted, setSavingAssisted] = useState(false);
  const [openMyCareHub, setOpenMyCareHub] = useState(false);

  const toggleMyAssisted = async (next) => {
    if (myMembers.length === 0) return;
    setSavingAssisted(true);
    // Update tutti i miei member rows in batch
    const ids = myMembers.map((m) => m.id);
    await supabase.from('members')
      .update({ is_assisted: next })
      .in('id', ids);
    setSavingAssisted(false);
    onChanged && onChanged();
  };

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

  // Header avatar — sempre visibile in cima al profilo per dare un "hello"
  // immediato. Click su "Cambia colore" apre il color picker inline.
  const header = (
    <div className="profile-section" style={{
      display: 'flex', alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 16,
    }}>
      <Avatar
        name={profile?.display_name}
        avatarUrl={profile?.avatar_url}
        avatarLetter={initial}
        avatarColor={color}
        size={64}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--k)', lineHeight: 1.2 }}>
          {profile?.display_name || '—'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 4, wordBreak: 'break-all' }}>
          {session.user.email || profile?.phone || t('profile_email_empty') || ''}
        </div>
      </div>
      <button className="profile-btn" onClick={() => setEditingColor(!editingColor)} data-testid="profile-toggle-color">
        🎨
      </button>
    </div>
  );

  // I 9 gruppi collassabili. Default: tutti chiusi (l'utente apre solo ciò
  // che gli interessa, schermata pulita).
  // Ognuno espone un titolo + sottotitolo + emoji icona + contenuto.
  return (
    <div className="profile-wrap">
      <h1 className="profile-h">{t('profile_h')}</h1>

      {header}

      {/* Color picker inline (sotto l'header) */}
      {editingColor && (
        <div className="profile-section" data-testid="profile-color-picker"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 0 }}>
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => saveColor(c)}
              style={{
                width: 32, height: 32, borderRadius: 10, background: c,
                border: color === c ? '3px solid var(--k)' : '1.5px solid var(--sm)',
              }} />
          ))}
        </div>
      )}

      {/* GRUPPO 1: I MIEI DATI */}
      <ProfileGroup icon="👤" title={t('profile_card_info_t')} subtitle={t('profile_card_info_s')} testid="profile-group-info">
        {/* Nome */}
        <div className="profile-row" style={profileRowInGroup}>
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

        {/* Compleanno */}
        <div className="profile-row" style={profileRowInGroup}>
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

        {/* Email */}
        <div className="profile-row" style={profileRowInGroup}>
          <div>
            <div className="profile-label">{t('profile_email')}</div>
            <div className="profile-value" style={{ color: 'var(--km)' }}>
              {session.user.email || (
                <em style={{ fontStyle: 'italic', fontSize: 13 }}>
                  {t('profile_email_empty') || 'Nessuna email associata'}
                </em>
              )}
            </div>
          </div>
        </div>

        {/* Telefono */}
        <div style={{ marginTop: 8 }}>
          <ProfilePhoneCard
            session={session}
            profile={profile}
            onChanged={onChanged}
          />
        </div>
      </ProfileGroup>

      {/* GRUPPO 1.5: SALUTE & ASSISTENZA (self-service) */}
      <ProfileGroup icon="🩺" title={t('profile_card_health_t') || 'Salute & assistenza'} subtitle={t('profile_card_health_s') || 'Sblocca le medicine personali, profilo medico e diario'} testid="profile-group-health">
        <div style={{
          padding: 12, borderRadius: 12,
          background: iAmAssisted ? 'var(--gnB)' : 'var(--ab)',
          border: `1px solid ${iAmAssisted ? 'var(--gn)' : 'var(--sd)'}`,
          transition: 'all 0.2s ease',
        }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            cursor: savingAssisted ? 'wait' : 'pointer', margin: 0,
          }}>
            <input
              type="checkbox"
              checked={iAmAssisted}
              disabled={savingAssisted || myMembers.length === 0}
              onChange={(e) => toggleMyAssisted(e.target.checked)}
              data-testid="profile-self-assisted-toggle"
              style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)' }}>
                🩺 {t('profile_self_assisted_label') || 'Sono un membro assistito'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2, lineHeight: 1.4 }}>
                {t('profile_self_assisted_hint') || 'Attiva la gestione delle tue medicine con reminder, profilo medico e diario giornaliero.'}
              </div>
            </div>
          </label>
        </div>

        {iAmAssisted && myMembers.length > 0 && (
          <button
            type="button"
            onClick={() => setOpenMyCareHub(true)}
            data-testid="profile-open-my-care-hub"
            className="btn full"
            style={{ marginTop: 12 }}>
            🩺 {t('profile_open_care_hub') || 'Apri il mio Care Hub'}
          </button>
        )}
      </ProfileGroup>

      {/* GRUPPO 2: NOTIFICHE */}
      <ProfileGroup icon="🔔" title={t('profile_card_notif_t')} subtitle={t('profile_card_notif_s')} testid="profile-group-notif">
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

          {/* Test push + diagnostica */}
          {notificationControl.notificationPermission === 'granted' && (
            <>
              <TestPushButton session={session} />
              <PushDiagnosticCard session={session} />
            </>
          )}

          {/* Quiet Hours */}
          {notificationControl.notificationPermission === 'granted' && (
            <QuietHoursControl />
          )}

          {/* Info */}
          <p
            style={{ fontSize: 12, color: 'var(--km)', lineHeight: 1.5, marginBottom: 0 }}
            dangerouslySetInnerHTML={{ __html: t('notif_info_30min') + '<br/>' + t('notif_info_immediate') }}
          />
        </div>
      </ProfileGroup>

      {/* GRUPPO 3: INSIGHTS AI */}
      {families.length > 0 && (
        <ProfileGroup icon="✨" title={t('profile_card_insights_t')} subtitle={t('profile_card_insights_s')} testid="profile-group-insights">
          <WeeklySummaryCard
            lazy
            familyId={activeFamilyId}
            familyName={
              activeFamilyId
                ? (families.find((f) => f.id === activeFamilyId)?.name || 'Famiglia')
                : `${families.length} ${t('profile_insights_families_label') || 'famiglie'}`
            }
            tasks={tasks}
            events={events}
            members={members}
          />
          <div style={{ marginTop: 12 }}>
            <WeeklyEmailSyncToggle session={session} />
          </div>
        </ProfileGroup>
      )}

      {/* GRUPPO 4: FAMILY MEMORIES */}
      {families.length > 0 && (
        <ProfileGroup icon="📸" title={t('profile_card_memories_t')} subtitle={t('profile_card_memories_s')} testid="profile-group-memories">
          <FamilyMemoriesCard families={families} members={members} me={me} />
        </ProfileGroup>
      )}

      {/* GRUPPO 5: APP & LINGUA */}
      <ProfileGroup icon="⚙️" title={t('profile_card_app_t')} subtitle={t('profile_card_app_s')} testid="profile-group-app">
        {/* Lingua */}
        <div className="profile-label" style={{ marginBottom: 8 }}>{t('profile_language')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {LANGS.map((l) => (
            <button key={l.id} onClick={() => changeLang(l.id)}
              data-testid={`profile-lang-${l.id}`}
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

        {/* Settings menu (Plans, Theme, A11y, Privacy) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SettingRow label={t('profile_plans')} onClick={() => setView('plans')} accent />
          <SettingRow label={t('profile_theme')} onClick={() => setView('theme')} />
          <SettingRow label={t('profile_accessibility')} onClick={() => setView('a11y')} />
          <SettingRow label={t('profile_privacy')} onClick={() => setView('privacy')} />
        </div>
      </ProfileGroup>

      {/* GRUPPO 6: STRUMENTI SMART */}
      <ProfileGroup icon="🛠️" title={t('profile_card_tools_t')} subtitle={t('profile_card_tools_s')} testid="profile-group-tools">
        <button
          type="button"
          className="btn full secondary"
          onClick={() => setShowImportSchedule(true)}
          data-testid="profile-import-schedule-btn"
          style={{ textAlign: 'left', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>📸</span>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--k)' }}>
              {t('imp_open_btn') || 'Importa assenze da foto turno'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
              {t('profile_tools_import_hint')}
            </div>
          </div>
          <span style={{ color: 'var(--km)', fontSize: 18 }}>›</span>
        </button>

        <button
          type="button"
          className="btn full secondary"
          onClick={() => setShowMerge(true)}
          data-testid="profile-merge-account-btn"
          style={{ textAlign: 'left', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <span style={{ fontSize: 22 }}>🔗</span>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--k)' }}>
              {t('merge_btn_h')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2 }}>
              {t('merge_btn_hint')}
            </div>
          </div>
          <span style={{ color: 'var(--km)', fontSize: 18 }}>›</span>
        </button>
      </ProfileGroup>

      {/* GRUPPO 7: INVITA UN AMICO */}
      <ProfileGroup icon="💝" title={t('profile_card_share_t')} subtitle={t('profile_card_share_s')} testid="profile-group-share">
        <InviteStatsCard session={session} families={families} />
        <p style={{ fontSize: 13, color: 'var(--km)', margin: '8px 0 12px', lineHeight: 1.4 }}>
          {t('profile_referral_sub')}
        </p>
        <button className="btn full" onClick={shareApp} data-testid="profile-referral-btn">{t('profile_referral_btn')}</button>
        <p style={{ fontSize: 11, color: 'var(--km)', margin: '10px 4px 0', lineHeight: 1.45, textAlign: 'center' }}>
          💡 {t('invite_hint_family')} <strong>{t('family_title') || 'Famiglia'} → 💌</strong>.
        </p>
      </ProfileGroup>

      {/* GRUPPO 8: TOUR & AIUTO */}
      <ProfileGroup icon="🎓" title={t('profile_card_tour_t')} subtitle={t('profile_card_tour_s')} testid="profile-group-tour">
        <button
          type="button"
          className="btn full secondary"
          onClick={() => setShowTour(true)}
          data-testid="profile-show-tour-btn"
        >
          {t('profile_tour_btn')}
        </button>
      </ProfileGroup>

      {/* Logout - sezione finale separata */}
      <div className="profile-section" style={{ borderBottom: 'none' }}>
        <button className="btn full danger" onClick={() => supabase.auth.signOut()} data-testid="profile-logout-btn">
          {t('logout')}
        </button>
        <p style={{ fontSize: 11, color: 'var(--km)', textAlign: 'center', marginTop: 16, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
          {t('profile_app_info')}
        </p>
      </div>

      {showTour && (
        <OnboardingTour onClose={() => setShowTour(false)} />
      )}

      {showImportSchedule && (
        <ImportScheduleModal
          session={session}
          profile={profile}
          families={families}
          onClose={() => setShowImportSchedule(false)}
          onSaved={() => { setShowImportSchedule(false); onChanged && onChanged(); }}
        />
      )}

      {showMerge && (
        <MergeAccountModal
          session={session}
          onClose={() => setShowMerge(false)}
          onMerged={() => {
            // Dopo il merge: forza il ricaricamento dello state app
            setShowMerge(false);
            onChanged && onChanged();
            // Soft reload per ripopolare le famiglie / membri dell'utente B
            setTimeout(() => window.location.reload(), 1500);
          }}
        />
      )}

      {/* Care Hub personale dell'utente loggato */}
      {openMyCareHub && myMembers[0] && (
        <MedicationsModal
          member={myMembers[0]}
          me={myMembers[0]}
          onClose={() => { setOpenMyCareHub(false); onChanged && onChanged(); }}
        />
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

// Stile compatto per la riga "campo + valore + bottone modifica" usato
// all'interno dei gruppi collassabili (niente padding orizzontale extra
// perché il gruppo lo eredita già dal proprio container).
const profileRowInGroup = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 0', borderBottom: '1px solid var(--sm)',
};

/**
 * ProfileGroup — sezione collassabile del Profilo.
 * Mostra un header tappabile con icona + titolo + sottotitolo + chevron,
 * e rivela il `children` quando l'utente espande.
 *
 * Stato locale: ogni gruppo ricorda l'apertura via localStorage in modo
 * che dopo un reload l'utente ritrovi l'ultima configurazione.
 */
function ProfileGroup({ icon, title, subtitle, defaultOpen = false, testid, children }) {
  const storageKey = `fammy_profile_group_${testid}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch (_) {}
    return defaultOpen;
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch (_) {}
  };

  return (
    <div className="profile-section" style={{ paddingTop: 0, paddingBottom: 0 }}>
      <button
        type="button"
        onClick={toggle}
        data-testid={testid ? `${testid}-toggle` : undefined}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 0', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--ab)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--k)', lineHeight: 1.2 }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--km)', marginTop: 2, lineHeight: 1.3 }}>
            {subtitle}
          </div>
        </div>
        <span style={{
          color: 'var(--km)', fontSize: 22, fontWeight: 300,
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}>›</span>
      </button>
      {open && (
        <div
          data-testid={testid ? `${testid}-content` : undefined}
          style={{ paddingBottom: 16 }}>
          {children}
        </div>
      )}
    </div>
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
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState('info'); // 'info' | 'success' | 'warn' | 'error'

  const sendTest = async () => {
    if (!session?.user?.id) return;
    setBusy(true); setMsg(''); setMsgTone('info');
    try {
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
          body: t('test_push_body') || 'Le push notifications funzionano correttamente!',
          tag: 'test-push',
        }),
      });

      // Edge Function non deployata: Supabase Gateway risponde 404
      if (res.status === 404) {
        setMsg(t('test_push_not_deployed'));
        setMsgTone('info');
        return;
      }

      let data = {};
      try { data = await res.json(); } catch { /* non-JSON response */ }

      if (data.sent && data.sent > 0) {
        setMsg(t('test_push_ok', { n: data.sent }));
        setMsgTone('success');
      } else if (data.reason === 'no_subscriptions') {
        setMsg(t('test_push_no_subs'));
        setMsgTone('warn');
      } else if (!res.ok) {
        setMsg(t('test_push_unavailable'));
        setMsgTone('info');
      } else {
        setMsg(data.error || t('test_push_unavailable'));
        setMsgTone('warn');
      }
    } catch (e) {
      // Network error / function non raggiungibile: messaggio educato
      const isNetwork = e && (e.name === 'TypeError' || /load failed|failed to fetch/i.test(e.message || ''));
      if (isNetwork) {
        setMsg(t('test_push_unavailable'));
        setMsgTone('info');
      } else {
        setMsg(`Errore: ${e.message}`);
        setMsgTone('error');
      }
    } finally {
      setBusy(false);
    }
  };

  const toneStyles = {
    success: { bg: 'var(--gnB)', color: 'var(--gn)', icon: '✅' },
    warn:    { bg: '#FFF6E5',   color: '#9A6300',  icon: '⚠️' },
    error:   { bg: '#FDECEC',   color: '#A93B2B',  icon: '❌' },
    info:    { bg: 'var(--ab)', color: 'var(--km)', icon: 'ℹ️' },
  };
  const tone = toneStyles[msgTone] || toneStyles.info;

  return (
    <div style={{
      padding: 12, background: 'var(--ab)', borderRadius: 12,
      border: '1px solid var(--sd)',
    }}>
      <button onClick={sendTest} disabled={busy}
        data-testid="profile-test-push-btn"
        className="btn full secondary"
        style={{ fontSize: 13, padding: '10px 14px' }}>
        {busy ? <span className="spin dark" /> : t('test_push_btn')}
      </button>
      {msg && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 8,
          background: tone.bg, color: tone.color,
          fontSize: 12, fontWeight: 600, lineHeight: 1.4,
          display: 'flex', alignItems: 'flex-start', gap: 6,
        }} data-testid="profile-test-push-msg">
          <span style={{ flexShrink: 0 }}>{tone.icon}</span>
          <span>{msg}</span>
        </div>
      )}
    </div>
  );
}

// Card di diagnostica push: mostra all'utente quanti dispositivi sono
// registrati per ricevere le notifiche push e (in caso di problemi) un
// hint su come correggere (es. su iOS bisogna aggiungere FAMMY a Home).
function PushDiagnosticCard({ session }) {
  const { t } = useT();
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Detect iOS PWA standalone
  const isIOS = typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.user?.id) return;
      setLoading(true);
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id, user_agent, last_used_at, created_at')
        .eq('user_id', session.user.id)
        .order('last_used_at', { ascending: false });
      if (!cancelled) {
        setSubs(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, refreshKey]);

  if (!session?.user?.id) return null;

  const niceDevice = (ua) => {
    if (!ua) return '🖥️ —';
    if (/iPhone/i.test(ua)) return '📱 iPhone';
    if (/iPad/i.test(ua)) return '📱 iPad';
    if (/Android/i.test(ua)) return '📱 Android';
    if (/Macintosh/i.test(ua)) return '💻 Mac';
    if (/Windows/i.test(ua)) return '💻 Windows';
    return '🖥️ Browser';
  };
  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div style={{
      padding: 12, background: 'var(--ab)', borderRadius: 12,
      border: '1px solid var(--sd)', marginTop: 8,
    }} data-testid="push-diagnostic-card">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
          {t('push_diag_h')}
        </div>
        <button type="button" onClick={() => setRefreshKey((k) => k + 1)}
          style={{
            padding: '4px 10px', border: '1px solid var(--sm)', borderRadius: 100,
            background: 'white', cursor: 'pointer', fontSize: 11, color: 'var(--km)',
          }}
          data-testid="push-diagnostic-refresh">↻</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--km)' }}>…</div>
      ) : subs.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9A6300', lineHeight: 1.4 }}>
          ⚠️ <strong>{t('push_diag_empty_h')}</strong>
          <div style={{ marginTop: 6, color: 'var(--km)' }}>
            {t('push_diag_empty_p')}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--gn)', fontWeight: 700 }}>
            {subs.length === 1 ? t('push_diag_count_one') : t('push_diag_count_many', { n: subs.length })}
          </div>
          {subs.slice(0, 5).map((s) => (
            <div key={s.id} style={{
              fontSize: 12, color: 'var(--km)',
              display: 'flex', justifyContent: 'space-between', gap: 8,
              padding: '4px 0', borderTop: '1px dashed var(--sm)',
            }}>
              <span>{niceDevice(s.user_agent)}</span>
              <span style={{ fontSize: 11, fontStyle: 'italic' }}>
                {s.last_used_at ? t('push_diag_last_used', { when: fmtDate(s.last_used_at) }) : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {isIOS && !isStandalone && (
        <div style={{
          marginTop: 10, padding: 8, borderRadius: 8,
          background: '#FFF6E5', border: '1px solid #FFD27A',
          fontSize: 12, color: '#7A4E00', lineHeight: 1.45,
        }}>
          {t('push_diag_ios_hint')}
        </div>
      )}

      {/* Troubleshooting: "Le push non arrivano in background?" — link
          collassabile con i fix più comuni per Android / iOS. */}
      <BackgroundPushHelp />
    </div>
  );
}

function BackgroundPushHelp() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const isIOS = typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  const isAndroid = typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent || '');

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        data-testid="background-push-help-toggle"
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--ac)', textDecoration: 'underline',
          fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 600,
        }}>
        🤔 {t('push_help_link') || 'Le notifiche non arrivano in background?'}
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 12,
          background: 'var(--s)', border: '1px solid var(--sm)',
          fontSize: 12, color: 'var(--k)', lineHeight: 1.55,
        }} data-testid="background-push-help-box">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {t('push_help_h') || 'Cose da controllare:'}
          </div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {isAndroid && (
              <>
                <li style={{ marginBottom: 4 }}>
                  <strong>{t('push_help_android_battery_h') || 'Ottimizzazione batteria'}</strong>:
                  {' '}{t('push_help_android_battery_p') || 'Impostazioni → App → FAMMY → Batteria → "Non ottimizzato". Senza, Android killa il Service Worker dopo qualche minuto.'}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <strong>{t('push_help_android_bg_h') || 'Attività in background'}</strong>:
                  {' '}{t('push_help_android_bg_p') || 'In Impostazioni → App → FAMMY → "Consenti attività in background".'}
                </li>
              </>
            )}
            {isIOS && (
              <>
                <li style={{ marginBottom: 4 }}>
                  <strong>{t('push_help_ios_pwa_h') || 'App installata dalla Home'}</strong>:
                  {' '}{t('push_help_ios_pwa_p') || 'Su iPhone le push funzionano SOLO se hai aggiunto FAMMY alla schermata Home dal menu Condividi di Safari, e apri sempre l\'app da quell\'icona.'}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <strong>{t('push_help_ios_focus_h') || 'Focus / Modalità Aereo'}</strong>:
                  {' '}{t('push_help_ios_focus_p') || 'Controlla che non ci sia una "Modalità Concentrazione" attiva (es. "Non disturbare", "Sonno") che blocca le notifiche.'}
                </li>
              </>
            )}
            <li style={{ marginBottom: 4 }}>
              <strong>{t('push_help_perm_h') || 'Permesso notifiche'}</strong>:
              {' '}{t('push_help_perm_p') || 'Se l\'hai accettato e poi negato, in alcuni browser va riconcesso manualmente dalle impostazioni del sito.'}
            </li>
            <li style={{ marginBottom: 4 }}>
              <strong>{t('push_help_open_h') || 'Riapri FAMMY ogni tanto'}</strong>:
              {' '}{t('push_help_open_p') || 'L\'apertura "rinnova" la subscription. Anche bastano 2 secondi una volta a settimana.'}
            </li>
          </ol>
          <div style={{
            marginTop: 10, padding: 8, background: 'var(--ab)',
            borderRadius: 8, fontSize: 11, color: 'var(--km)',
          }}>
            {t('push_help_test_hint') || '💡 Per un test "vero": invia la notifica di test, poi chiudi completamente FAMMY (swipe dalle app recenti) e chiedi a un familiare di scriverti un commento su un task. Dovrebbe arrivare.'}
          </div>
        </div>
      )}
    </div>
  );
}

