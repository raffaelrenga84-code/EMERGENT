import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT, LANGS } from '../lib/i18n.jsx';
import OnboardingTour from '../components/OnboardingTour.jsx';
import JoinFamilyByCodeModal from '../components/JoinFamilyByCodeModal.jsx';
import { getWelcomeHidden, setWelcomeHidden } from '../components/WelcomeHubModal.jsx';
import FamilyInviteModal from '../components/FamilyInviteModal.jsx';

const EMOJI = ['🏡', '🏠', '👨‍👩‍👧‍👦', '🌳', '⛱️', '❤️', '🌟', '🍝'];

// Fallback nome: alcuni account (phone-only, Apple "Hide my email") possono
// avere session.user.email = null. Mai accedere a .split('@') direttamente.
function fallbackDisplayName(profile, session) {
  if (profile?.display_name) return profile.display_name;
  const email = session?.user?.email;
  if (email) return email.split('@')[0];
  const phone = session?.user?.phone;
  if (phone) return phone;
  return 'Membro';
}

export default function WelcomeScreen({ session, profile, onCreated, autoSkip = false }) {
  const { t, lang, setLang } = useT();
  const [view, setView] = useState('hub'); // 'hub' | 'family' | 'task' | 'event' | 'demo'
  const [busy, setBusy] = useState(false);
  // Mostra il tour onboarding la prima volta (anche prima di creare famiglia).
  // HomeScreen ha la stessa logica → se l'utente atterra qui per la prima
  // volta vede il tour qui; se atterra direttamente in Home (es. via invito)
  // lo vede lì.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return false; // gestito in HomeScreen
  });
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [dontShow, setDontShow] = useState(getWelcomeHidden());

  // autoSkip: utente ha spuntato "Non mostrare più" → skipToBoard immediato
  useEffect(() => {
    if (autoSkip) skipToBoard();
  }, []);

  const initial = (profile?.avatar_letter || (profile?.display_name || 'U').charAt(0)).toUpperCase();

  // Crea una famiglia "default" e va in bacheca.
  // IMPORTANTE: il nome non deve mai derivare dal placeholder ('es. Famiglia Renga')
  // perché altrimenti tutti gli utenti che skippano si ritrovano famiglie fake con
  // lo stesso nome, generando confusione (vedi bug del 10/05/2026).
  const skipToBoard = async () => {
    if (busy) return;
    const displayName = fallbackDisplayName(profile, session);
    // Nome di fallback: "La famiglia di <Nome>" → univoco per persona, niente collisioni
    const defaultFamilyName = `La famiglia di ${displayName}`;
    setBusy(true);
    try {
      // Pre-check: se per qualche motivo l'utente ha GIÀ delle famiglie ma
      // la fetch precedente le aveva mancate (RLS race / network glitch),
      // evita di crearne una duplicata: ricontrolla qui e in caso esci.
      const { data: existingMembers, error: checkErr } = await supabase
        .from('members')
        .select('family_id')
        .eq('user_id', session.user.id)
        .limit(1);
      if (!checkErr && Array.isArray(existingMembers) && existingMembers.length > 0) {
        // Ha già famiglie → refresh App.jsx invece di crearne una nuova
        onCreated && onCreated();
        return;
      }

      // Crea famiglia + primo membro via RPC SECURITY DEFINER
      // (bypassa RLS in modo controllato, atomico, garantisce profile FK)
      const { data: famId, error: rpcErr } = await supabase.rpc('create_family_with_owner', {
        p_name: defaultFamilyName,
        p_emoji: '🏡',
        p_display_name: displayName,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const newFamilyId = typeof famId === 'string' ? famId : (Array.isArray(famId) ? famId[0] : famId?.id);
      if (!newFamilyId) throw new Error(t('wz_create_failed') || 'Creazione famiglia fallita.');
      onCreated && onCreated();
    } catch (e) {
      alert(e.message || t('err_unexpected') || 'Errore imprevisto. Riprova tra poco.');
      setBusy(false);
    }
  };

  if (view === 'family') {
    return <FamilyCreateForm session={session} profile={profile} onCreated={onCreated} onBack={() => setView('hub')} />;
  }
  if (view === 'task' || view === 'event') {
    return <FamilyThenItem mode={view} session={session} profile={profile} onCreated={onCreated} onBack={() => setView('hub')} />;
  }
  if (view === 'demo') {
    return <DemoCreator session={session} profile={profile} onCreated={onCreated} onBack={() => setView('hub')} />;
  }

  return (
    <div className="hub-wrap">
      {/* Switcher lingua in alto a destra — pattern identico a LoginScreen */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4, zIndex: 5 }}>
        {LANGS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            data-testid={`welcome-lang-${l.id}`}
            style={{
              background: 'none', border: 'none', fontSize: 18, padding: 6,
              opacity: lang === l.id ? 1 : 0.4, cursor: 'pointer',
            }}
            title={l.label}>
            {l.flag}
          </button>
        ))}
      </div>

      {showOnboarding && (
        <OnboardingTour onClose={() => setShowOnboarding(false)} />
      )}
      <div className="hub-greeting">
        <div className="av" style={{ width: 36, height: 36, fontSize: 14, borderRadius: 12, background: profile?.avatar_color || '#1C1611' }}>
          {initial}
        </div>
        <span>{t('welcome_hi', { name: profile?.display_name ? `, ${profile.display_name}` : '' })}</span>
      </div>

      <h1 className="hub-h">{t('welcome_hub_h')}</h1>
      <p className="hub-sub">{t('welcome_hub_sub')}</p>

      <div className="hub-cards">
        <HubCard emoji="👨‍👩‍👧‍👦" title={t('hub_card_family_t')} subtitle={t('hub_card_family_s')} onClick={() => setView('family')} />
        <HubCard emoji="🎟️" title={t('welcome_card_invite_t')} subtitle={t('welcome_card_invite_s')} onClick={() => setShowJoinCode(true)} />
        <HubCard emoji="✅" title={t('hub_card_task_t')} subtitle={t('hub_card_task_s')} onClick={() => setView('task')} />
        <HubCard emoji="📅" title={t('hub_card_event_t')} subtitle={t('hub_card_event_s')} onClick={() => setView('event')} />
        <HubCard emoji="👀" title={t('hub_card_demo_t')} subtitle={t('hub_card_demo_s')} onClick={() => setView('demo')} />
      </div>

      {/* Spunta "Non mostrare più" — persistente in localStorage */}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, fontSize: 12.5, color: 'var(--km)', cursor: 'pointer',
        margin: '20px auto 4px', userSelect: 'none' }}>
        <input type="checkbox" checked={dontShow}
          onChange={(e) => { setDontShow(e.target.checked); setWelcomeHidden(e.target.checked); }}
          data-testid="welcome-dont-show"
          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--ac)' }} />
        {t('whm_dont_show') || 'Non mostrare più automaticamente'}
      </label>

      <button className="link-btn" style={{ display: 'block', margin: '4px auto 0', fontSize: 14, fontWeight: 600 }}
        onClick={skipToBoard} disabled={busy}>
        {busy ? <span className="spin dark" /> : t('hub_skip_btn')}
      </button>

      <button className="link-btn" style={{ display: 'block', margin: '8px auto 0', color: 'var(--km)' }}
        onClick={() => supabase.auth.signOut()}>
        {t('logout')}
      </button>

      {showJoinCode && (
        <JoinFamilyByCodeModal
          profile={profile}
          onClose={() => setShowJoinCode(false)}
          onJoined={() => { setShowJoinCode(false); onCreated && onCreated(); }}
        />
      )}
    </div>
  );
}

function HubCard({ emoji, title, subtitle, onClick }) {
  return (
    <button className="hub-card" onClick={onClick}>
      <div className="hub-card-emoji">{emoji}</div>
      <div className="hub-card-text">
        <div className="hub-card-title">{title}</div>
        <div className="hub-card-sub">{subtitle}</div>
      </div>
      <div className="hub-card-arrow">›</div>
    </button>
  );
}

function FamilyCreateForm({ session, profile, onCreated, onBack }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏡');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Step 2 onboarding: famiglia creata → invita subito il partner
  const [created, setCreated] = useState(null);
  const [showInvite, setShowInvite] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      // RPC SECURITY DEFINER: crea famiglia + primo membro in un colpo solo.
      // (Niente INSERT diretto su `families`: se le policy RLS del DB sono
      // incomplete — com'è successo dopo l'incidente DB — l'insert fallisce
      // con "new row violates row-level security policy". La RPC bypassa.)
      const displayName = fallbackDisplayName(profile, session);
      const { data: famId, error: e1 } = await supabase.rpc('create_family_with_owner', {
        p_name: name.trim(), p_emoji: emoji, p_display_name: displayName,
      });
      if (e1) throw e1;
      // Niente onCreated qui: mostriamo prima lo step "invita il partner".
      // FAMMY da soli serve a poco → questo è il momento migliore per
      // portare dentro il resto della famiglia.
      setBusy(false);
      setCreated({ id: famId, name: name.trim(), emoji });
    } catch (e) {
      setErr(e.message || t('err_generic_short') || 'Errore.');
      setBusy(false);
    }
  };

  // ====== STEP 2: invita subito il partner ======
  if (created) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}
        data-testid="onboarding-invite-step">
        <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
        <h1 style={{ fontFamily: 'var(--fs)', fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
          {t('nf_created_h') || 'Famiglia creata!'}
        </h1>
        <p style={{ color: 'var(--km)', marginBottom: 28, lineHeight: 1.5 }}>
          {t('ob_invite_sub') || 'FAMMY funziona meglio insieme: invita subito il tuo partner o un familiare.'}
        </p>
        <button className="btn full" onClick={() => setShowInvite(true)}
          data-testid="onboarding-invite-btn">
          💌 {t('nf_invite_btn') || 'Invita con un link'}
        </button>
        <button className="link-btn" onClick={() => onCreated && onCreated()}
          data-testid="onboarding-goto-board-btn"
          style={{ width: '100%', textAlign: 'center', marginTop: 16 }}>
          {t('ob_goto_board') || 'Vai alla bacheca →'}
        </button>
        {showInvite && (
          <FamilyInviteModal
            family={created}
            session={session}
            onClose={() => setShowInvite(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 420, margin: '0 auto' }}>
      <button className="link-btn" onClick={onBack}>{t('hub_back')}</button>
      <div style={{ fontSize: 56, textAlign: 'center', marginBottom: 8 }}>👋</div>
      <h1 style={{ fontFamily: 'var(--fs)', fontSize: 28, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
        {t('hub_card_family_t')}
      </h1>
      <p style={{ color: 'var(--km)', textAlign: 'center', marginBottom: 28, lineHeight: 1.5 }}>
        {t('welcome_intro')}
      </p>

      <form onSubmit={create}>
        <label htmlFor="famname">{t('welcome_family_label')}</label>
        <input id="famname" className="input" placeholder={t('welcome_family_ph')}
          value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <div style={{ marginTop: 20 }}>
          <label>{t('welcome_emoji')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EMOJI.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)}
                style={{
                  width: 48, height: 48, border: '1.5px solid',
                  borderColor: emoji === e ? 'var(--k)' : 'var(--sm)',
                  background: emoji === e ? 'var(--sm)' : 'white',
                  borderRadius: 12, fontSize: 22,
                }}>{e}</button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn full" disabled={busy || !name.trim()} style={{ marginTop: 28 }}>
          {busy ? <span className="spin" /> : t('welcome_create_btn')}
        </button>
        {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}
      </form>
    </div>
  );
}

// Crea famiglia + apre direttamente form per task/evento
function FamilyThenItem({ mode, session, profile, onCreated, onBack }) {
  const { t } = useT();
  const [step, setStep] = useState('family'); // 'family' | 'task' | 'event'
  const [familyName, setFamilyName] = useState('');
  const [emoji, setEmoji] = useState('🏡');
  const [familyId, setFamilyId] = useState(null);
  const [memberId, setMemberId] = useState(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState('care');

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const createFamily = async (e) => {
    e.preventDefault();
    if (!familyName.trim()) return;
    setBusy(true); setErr('');
    try {
      // Usa RPC SECURITY DEFINER (atomic + bypass RLS controllato)
      const displayName = fallbackDisplayName(profile, session);
      const { data: famId, error: e1 } = await supabase.rpc('create_family_with_owner', {
        p_name: familyName.trim(),
        p_emoji: emoji,
        p_display_name: displayName,
      });
      if (e1) throw e1;
      const newFamilyId = typeof famId === 'string' ? famId : (Array.isArray(famId) ? famId[0] : famId?.id);
      if (!newFamilyId) throw new Error(t('wz_create_failed') || 'Creazione famiglia fallita.');
      // Recupera l'id del nuovo member (creato dalla RPC) per gli step successivi
      const { data: mem } = await supabase.from('members')
        .select('id').eq('family_id', newFamilyId).eq('user_id', session.user.id).single();
      setFamilyId(newFamilyId); setMemberId(mem?.id);
      setStep(mode);
      setBusy(false);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const createTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setBusy(true);
    await supabase.from('tasks').insert({
      family_id: familyId, title: taskTitle.trim(), category: taskCategory,
      status: 'todo', visibility: 'all', author_id: memberId,
    });
    onCreated && onCreated();
  };

  const createEvent = async (e) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDate) return;
    setBusy(true);
    const startsAt = eventTime
      ? new Date(`${eventDate}T${eventTime}:00`).toISOString()
      : new Date(`${eventDate}T09:00:00`).toISOString();
    await supabase.from('events').insert({
      family_id: familyId, title: eventTitle.trim(), starts_at: startsAt, created_by: memberId,
    });
    onCreated && onCreated();
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 420, margin: '0 auto' }}>
      <button className="link-btn" onClick={onBack}>{t('hub_back')}</button>

      <div style={{ fontSize: 56, textAlign: 'center', marginBottom: 8 }}>
        {step === 'family' ? '👋' : (mode === 'task' ? '✅' : '📅')}
      </div>

      {step === 'family' && (
        <>
          <h1 style={{ fontFamily: 'var(--fs)', fontSize: 24, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
            {t('hub_card_family_t')}
          </h1>
          <p style={{ color: 'var(--km)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5, fontSize: 13 }}>
            Per aggiungere {mode === 'task' ? 'un incarico' : 'un evento'} serve prima una famiglia.
          </p>
          <form onSubmit={createFamily}>
            <label>{t('welcome_family_label')}</label>
            <input className="input" placeholder={t('welcome_family_ph')}
              value={familyName} onChange={(e) => setFamilyName(e.target.value)} autoFocus />

            <div style={{ marginTop: 20 }}>
              <label>{t('welcome_emoji')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {EMOJI.map((e) => (
                  <button key={e} type="button" onClick={() => setEmoji(e)}
                    style={{
                      width: 48, height: 48, border: '1.5px solid',
                      borderColor: emoji === e ? 'var(--k)' : 'var(--sm)',
                      background: emoji === e ? 'var(--sm)' : 'white',
                      borderRadius: 12, fontSize: 22,
                    }}>{e}</button>
                ))}
              </div>
            </div>

            <button type="submit" className="btn full" disabled={busy || !familyName.trim()} style={{ marginTop: 24 }}>
              {busy ? <span className="spin" /> : 'Avanti →'}
            </button>
            {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}
          </form>
        </>
      )}

      {step === 'task' && (
        <>
          <h1 style={{ fontFamily: 'var(--fs)', fontSize: 24, fontWeight: 600, textAlign: 'center', marginBottom: 24 }}>
            {t('hub_card_task_t')}
          </h1>
          <form onSubmit={createTask}>
            <label>{t('addtask_title_label')}</label>
            <input className="input" placeholder={t(`addtask_title_ph_${taskCategory}`)}
              value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} autoFocus />

            <div style={{ marginTop: 16 }}>
              <label>{t('addtask_cat_label')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { id: 'care', e: '❤️', l: t('cat_care') },
                  { id: 'home', e: '🏠', l: t('cat_home') },
                  { id: 'health', e: '💊', l: t('cat_health') },
                  { id: 'admin', e: '📋', l: t('cat_admin') },
                  { id: 'spese', e: '💶', l: t('cat_spese') },
                  { id: 'other', e: '📌', l: t('cat_other') },
                ].map((c) => (
                  <button key={c.id} type="button" onClick={() => setTaskCategory(c.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 100, border: '1.5px solid',
                      borderColor: taskCategory === c.id ? 'var(--k)' : 'var(--sm)',
                      background: taskCategory === c.id ? 'var(--sm)' : 'white',
                      fontSize: 13, fontWeight: 600,
                    }}>{c.e} {c.l}</button>
                ))}
              </div>
            </div>

            <button type="submit" className="btn full" disabled={busy || !taskTitle.trim()} style={{ marginTop: 24 }}>
              {busy ? <span className="spin" /> : t('add')}
            </button>
          </form>
        </>
      )}

      {step === 'event' && (
        <>
          <h1 style={{ fontFamily: 'var(--fs)', fontSize: 24, fontWeight: 600, textAlign: 'center', marginBottom: 24 }}>
            {t('hub_card_event_t')}
          </h1>
          <form onSubmit={createEvent}>
            <label>{t('addtask_title_label')}</label>
            <input className="input" placeholder={t('addevent_title_ph')}
              value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} autoFocus />

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <div style={{ flex: 1 }}>
                <label>{t('addevent_date')}</label>
                <input type="date" className="input" value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label>{t('addevent_time')}</label>
                <input type="time" className="input" value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)} />
              </div>
            </div>

            <button type="submit" className="btn full" disabled={busy || !eventTitle.trim() || !eventDate} style={{ marginTop: 24 }}>
              {busy ? <span className="spin" /> : t('add')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function DemoCreator({ session, profile, onCreated, onBack }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true); setErr('');
    try {
      // Crea famiglia + primo membro via RPC SECURITY DEFINER
      const displayName = fallbackDisplayName(profile, session);
      const { data: famId, error: e1 } = await supabase.rpc('create_family_with_owner', {
        p_name: 'Famiglia Demo',
        p_emoji: '🏡',
        p_display_name: displayName,
      });
      if (e1) throw e1;
      const newFamilyId = typeof famId === 'string' ? famId : (Array.isArray(famId) ? famId[0] : famId?.id);
      if (!newFamilyId) throw new Error(t('wz_create_demo_failed') || 'Creazione famiglia demo fallita.');

      // Aggiungi i membri demo (la RPC ha già creato il primo)
      await supabase.from('members').insert([
        { family_id: newFamilyId, name: 'Nonno Francesco', role: 'nonno', avatar_letter: 'F', avatar_color: '#5A4A3A', status: 'active' },
        { family_id: newFamilyId, name: 'Mamma Maria', role: 'mamma', avatar_letter: 'M', avatar_color: '#E91E8C', status: 'active' },
      ]);

      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const inThreeDays = new Date(); inThreeDays.setDate(inThreeDays.getDate() + 3);
      await supabase.from('tasks').insert([
        { family_id: newFamilyId, title: 'Comprare il pane', category: 'home', status: 'todo' },
        { family_id: newFamilyId, title: 'Portare nonno dal cardiologo', category: 'health', status: 'todo', due_date: tomorrow.toISOString().slice(0,10) },
        { family_id: newFamilyId, title: 'Pagare bolletta luce', category: 'admin', status: 'to_pay' },
      ]);
      await supabase.from('events').insert([
        { family_id: newFamilyId, title: 'Cena di compleanno mamma', starts_at: inThreeDays.toISOString(), location: 'Casa' },
      ]);

      onCreated && onCreated();
    } catch (e) {
      setErr(e.message); setBusy(false);
    }
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 420, margin: '0 auto' }}>
      <button className="link-btn" onClick={onBack}>{t('hub_back')}</button>
      <div style={{ fontSize: 56, textAlign: 'center', marginBottom: 8 }}>👀</div>
      <h1 style={{ fontFamily: 'var(--fs)', fontSize: 28, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>
        {t('hub_card_demo_t')}
      </h1>
      <p style={{ color: 'var(--km)', textAlign: 'center', marginBottom: 28, lineHeight: 1.5 }}>
        Creiamo una famiglia di esempio con membri, incarichi ed eventi così puoi esplorare l'app.<br/>
        Potrai modificare o cancellare tutto in qualsiasi momento.
      </p>
      <button className="btn full" onClick={create} disabled={busy}>
        {busy ? <span className="spin" /> : 'Crea famiglia demo →'}
      </button>
      {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}
    </div>
  );
}
