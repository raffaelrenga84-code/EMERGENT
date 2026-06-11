import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT, LANGS } from '../lib/i18n.jsx';
import OnboardingTour from '../components/OnboardingTour.jsx';
import JoinFamilyByCodeModal from '../components/JoinFamilyByCodeModal.jsx';

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

export default function WelcomeScreen({ session, profile, onCreated }) {
  const { t, lang, setLang } = useT();
  const [view, setView] = useState('hub'); // 'hub' | 'family' | 'task' | 'event' | 'demo'
  const [busy, setBusy] = useState(false);
  // Mostra il tour onboarding la prima volta (anche prima di creare famiglia).
  // HomeScreen ha la stessa logica → se l'utente atterra qui per la prima
  // volta vede il tour qui; se atterra direttamente in Home (es. via invito)
  // lo vede lì.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem('fammy_onboarding_done'); } catch (e) { return false; }
  });
  const [showJoinCode, setShowJoinCode] = useState(false);

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
      const { data: rows, error: rpcErr } = await supabase.rpc('create_family_with_owner', {
        p_name: defaultFamilyName,
        p_emoji: '🏡',
        p_display_name: displayName,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      const fam = Array.isArray(rows) ? rows[0] : rows;
      if (!fam || !fam.id) throw new Error('Creazione famiglia fallita.');
      onCreated && onCreated();
    } catch (e) {
      alert(e.message || 'Errore imprevisto. Riprova tra poco.');
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

      <button className="link-btn" style={{ display: 'block', margin: '20px auto 0', fontSize: 14, fontWeight: 600 }}
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

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      const { data: fam, error: e1 } = await supabase
        .from('families')
        .insert({ name: name.trim(), emoji, created_by: session.user.id })
        .select().single();
      if (e1) throw e1;

      const displayName = fallbackDisplayName(profile, session);
      const { error: e2 } = await supabase.from('members').insert({
        family_id: fam.id, user_id: session.user.id, name: displayName,
        role: 'tu', avatar_letter: displayName.charAt(0).toUpperCase(), status: 'active',
      });
      if (e2) throw e2;
      onCreated && onCreated();
    } catch (e) {
      setErr(e.message || 'Errore.');
      setBusy(false);
    }
  };

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
      const { data: fam, error: e1 } = await supabase
        .from('families').insert({ name: familyName.trim(), emoji, created_by: session.user.id })
        .select().single();
      if (e1) throw e1;
      const displayName = fallbackDisplayName(profile, session);
      const { data: mem, error: e2 } = await supabase.from('members').insert({
        family_id: fam.id, user_id: session.user.id, name: displayName,
        role: 'tu', avatar_letter: displayName.charAt(0).toUpperCase(), status: 'active',
      }).select().single();
      if (e2) throw e2;
      setFamilyId(fam.id); setMemberId(mem.id);
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
      const { data: fam, error: e1 } = await supabase
        .from('families').insert({ name: 'Famiglia Demo', emoji: '🏡', created_by: session.user.id })
        .select().single();
      if (e1) throw e1;

      const displayName = fallbackDisplayName(profile, session);
      await supabase.from('members').insert([
        { family_id: fam.id, user_id: session.user.id, name: displayName,
          role: 'tu', avatar_letter: displayName.charAt(0).toUpperCase(),
          avatar_color: '#1C1611', status: 'active' },
        { family_id: fam.id, name: 'Nonno Francesco', role: 'nonno', avatar_letter: 'F', avatar_color: '#5A4A3A', status: 'active' },
        { family_id: fam.id, name: 'Mamma Maria', role: 'mamma', avatar_letter: 'M', avatar_color: '#E91E8C', status: 'active' },
      ]);

      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const inThreeDays = new Date(); inThreeDays.setDate(inThreeDays.getDate() + 3);
      await supabase.from('tasks').insert([
        { family_id: fam.id, title: 'Comprare il pane', category: 'home', status: 'todo' },
        { family_id: fam.id, title: 'Portare nonno dal cardiologo', category: 'health', status: 'todo', due_date: tomorrow.toISOString().slice(0,10) },
        { family_id: fam.id, title: 'Pagare bolletta luce', category: 'admin', status: 'to_pay' },
      ]);
      await supabase.from('events').insert([
        { family_id: fam.id, title: 'Cena di compleanno mamma', starts_at: inThreeDays.toISOString(), location: 'Casa' },
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
