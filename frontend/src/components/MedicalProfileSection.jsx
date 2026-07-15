import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import CareAttachments from './CareAttachments.jsx';

/**
 * MedicalProfileSection — sub-tab del CareHub: profilo medico (gruppo
 * sanguigno, allergie, contatti di emergenza, medico curante).
 *
 * Caricamento 1:1 dalla tabella `medical_profiles` (member_id PK).
 * Salvataggio via upsert.
 */
export default function MedicalProfileSection({ member, me }) {
  const { t: __t0 } = useT();
  // t con fallback: chiave mancante → '' → vale il testo dopo ||
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);

  // Campi
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState([]);
  const [foodIntolerances, setFoodIntolerances] = useState([]);
  const [conditions, setConditions] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecRelation, setEcRelation] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorPhone, setDoctorPhone] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [healthCard, setHealthCard] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('medical_profiles').select('*')
        .eq('member_id', member.id).maybeSingle();
      if (cancelled) return;
      setProfile(data || null);
      setBloodType(data?.blood_type || '');
      setAllergies(data?.allergies || []);
      setFoodIntolerances(data?.food_intolerances || []);
      setConditions(data?.conditions || '');
      setEcName(data?.emergency_contact_name || '');
      setEcPhone(data?.emergency_contact_phone || '');
      setEcRelation(data?.emergency_contact_relation || '');
      setDoctorName(data?.doctor_name || '');
      setDoctorPhone(data?.doctor_phone || '');
      setDoctorEmail(data?.doctor_email || '');
      setHealthCard(data?.health_card_number || '');
      setNotes(data?.notes || '');
      setEdited(false);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member.id]);

  const save = async () => {
    setSaving(true);
    const payload = {
      member_id: member.id,
      blood_type: bloodType || null,
      allergies,
      food_intolerances: foodIntolerances,
      conditions: conditions.trim() || null,
      emergency_contact_name: ecName.trim() || null,
      emergency_contact_phone: ecPhone.trim() || null,
      emergency_contact_relation: ecRelation.trim() || null,
      doctor_name: doctorName.trim() || null,
      doctor_phone: doctorPhone.trim() || null,
      doctor_email: doctorEmail.trim() || null,
      health_card_number: healthCard.trim() || null,
      notes: notes.trim() || null,
      updated_by: me?.id || null,
    };
    const { error } = await supabase
      .from('medical_profiles').upsert(payload, { onConflict: 'member_id' });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setEdited(false);
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--km)' }}>
      {t('loading') || 'Caricamento…'}
    </div>;
  }

  const onChange = (setter) => (val) => { setter(val); setEdited(true); };

  return (
    <div data-testid="medical-profile-section">
      {/* Banner emergenza in cima — visibile da subito per i caregivers */}
      {(ecName || ecPhone || bloodType) && (
        <div style={{
          padding: 12, borderRadius: 12, marginBottom: 12,
          background: '#FFF6E5', border: '1.5px solid #FFD27A',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7A4E00', textTransform: 'uppercase', marginBottom: 6 }}>
            🚨 {t('mp_emergency') || 'Emergenza'}
          </div>
          {bloodType && (
            <div style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{t('mp_blood_type') || 'Gruppo sang.'}</strong>: {bloodType}
            </div>
          )}
          {(ecName || ecPhone) && (
            <div style={{ fontSize: 13 }}>
              <strong>{t('mp_emergency_contact') || 'Contatto'}</strong>:
              {' '}{ecName}{ecRelation && ` (${ecRelation})`} —
              {' '}{ecPhone && (
                <a href={`tel:${ecPhone}`} style={{ color: '#7A4E00', fontWeight: 700 }}>{ecPhone}</a>
              )}
            </div>
          )}
        </div>
      )}

      <Section label={t('mp_blood_type_label') || 'Gruppo sanguigno'}>
        <select className="input" value={bloodType}
          onChange={(e) => onChange(setBloodType)(e.target.value)}
          data-testid="mp-blood-type">
          <option value="">—</option>
          {['0+', '0-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bt) => (
            <option key={bt} value={bt}>{bt}</option>
          ))}
        </select>
      </Section>

      <Section label={t('mp_allergies_label') || 'Allergie a farmaci'}>
        <TagInput value={allergies} onChange={onChange(setAllergies)}
          placeholder={t('mp_allergies_ph') || 'es. penicillina'}
          testid="mp-allergies" />
      </Section>

      <Section label={t('mp_food_label') || 'Allergie / intolleranze alimentari'}>
        <TagInput value={foodIntolerances} onChange={onChange(setFoodIntolerances)}
          placeholder={t('mp_food_ph') || 'es. lattosio, glutine'}
          testid="mp-food" />
      </Section>

      <Section label={t('mp_conditions_label') || 'Condizioni note'}>
        <textarea className="input" value={conditions} rows={2}
          onChange={(e) => onChange(setConditions)(e.target.value)}
          placeholder={t('mp_conditions_ph') || 'es. Diabete tipo 2, ipertensione'}
          data-testid="mp-conditions" />
      </Section>

      <div style={{
        marginTop: 16, padding: 12, borderRadius: 12,
        background: 'var(--ab)', border: '1px solid var(--sd)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 8 }}>
          🚨 {t('mp_emergency_h') || 'Contatto di emergenza'}
        </div>
        <input className="input" value={ecName}
          onChange={(e) => onChange(setEcName)(e.target.value)}
          placeholder={t('mp_ec_name_ph') || 'Nome (es. Maria)'}
          data-testid="mp-ec-name" />
        <input className="input" type="tel" value={ecPhone}
          onChange={(e) => onChange(setEcPhone)(e.target.value)}
          placeholder={t('mp_ec_phone_ph') || 'Telefono'}
          style={{ marginTop: 6 }}
          data-testid="mp-ec-phone" />
        <input className="input" value={ecRelation}
          onChange={(e) => onChange(setEcRelation)(e.target.value)}
          placeholder={t('mp_ec_relation_ph') || 'Relazione (es. figlia, marito)'}
          style={{ marginTop: 6 }}
          data-testid="mp-ec-relation" />
      </div>

      <div style={{
        marginTop: 12, padding: 12, borderRadius: 12,
        background: 'var(--ab)', border: '1px solid var(--sd)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase', marginBottom: 8 }}>
          🩺 {t('mp_doctor_h') || 'Medico curante'}
        </div>
        <input className="input" value={doctorName}
          onChange={(e) => onChange(setDoctorName)(e.target.value)}
          placeholder={t('mp_doctor_name_ph') || 'Nome del medico'}
          data-testid="mp-doc-name" />
        <input className="input" type="tel" value={doctorPhone}
          onChange={(e) => onChange(setDoctorPhone)(e.target.value)}
          placeholder={t('mp_doctor_phone_ph') || 'Telefono medico'}
          style={{ marginTop: 6 }}
          data-testid="mp-doc-phone" />
        <input className="input" type="email" value={doctorEmail}
          onChange={(e) => onChange(setDoctorEmail)(e.target.value)}
          placeholder={t('mp_doctor_email_ph') || 'Email medico (per richiedere ricette)'}
          style={{ marginTop: 6 }}
          data-testid="mp-doc-email" />
      </div>

      <Section label={t('mp_health_card_label') || 'Tessera sanitaria'}>
        <input className="input" value={healthCard}
          onChange={(e) => onChange(setHealthCard)(e.target.value)}
          placeholder={t('mp_health_card_ph') || 'es. RSSMRA80A01...'}
          data-testid="mp-health-card" />
      </Section>

      <Section label={t('mp_notes_label') || 'Note aggiuntive'}>
        <textarea className="input" value={notes} rows={3}
          onChange={(e) => onChange(setNotes)(e.target.value)}
          placeholder={t('mp_notes_ph') || 'Altre informazioni utili in caso di emergenza'}
          data-testid="mp-notes" />
      </Section>

      {/* === DOCUMENTI ALLEGATI (referti, esami, ricette) === */}
      <div style={{ marginTop: 16 }}>
        <CareAttachments
          memberId={member.id}
          kind="profile"
          parentId={null}
          meId={me?.id}
        />
      </div>

      {edited && (
        <button type="button" onClick={save} disabled={saving}
          className="btn full" style={{ marginTop: 16 }}
          data-testid="mp-save-btn">
          {saving ? <span className="spin" /> : `💾 ${t('save') || 'Salva'}`}
        </button>
      )}

      {profile?.updated_at && (
        <div style={{ fontSize: 11, color: 'var(--km)', textAlign: 'center', marginTop: 12 }}>
          {t('mp_last_updated', { when: new Date(profile.updated_at).toLocaleDateString() })
            || `Ultimo aggiornamento: ${new Date(profile.updated_at).toLocaleDateString()}`}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--km)', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TagInput({ value, onChange, placeholder, testid }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (value.includes(v)) return;
    onChange([...value, v]);
    setInput('');
  };
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {value.map((tag) => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 100,
            background: 'var(--ab)', border: '1px solid var(--sm)',
            fontSize: 12, fontWeight: 600,
          }}>
            {tag}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== tag))}
              style={{
                background: 'transparent', border: 'none', color: 'var(--rd)',
                cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1,
              }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          data-testid={testid}
          style={{ flex: 1 }}
        />
        <button type="button" onClick={add} className="profile-btn"
          data-testid={`${testid}-add`}>+</button>
      </div>
    </div>
  );
}
