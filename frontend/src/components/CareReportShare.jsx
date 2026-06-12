import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { toLocalYMD } from '../lib/dateUtils.js';
import { openExternal } from '../lib/openExternal.js';
import { generateDoctorReport } from '../lib/doctorReport.js';

/**
 * CareReportShare — bottom-sheet che genera un report testuale del Care Hub
 * del membro e offre opzioni di condivisione (clipboard / Web Share API /
 * email / WhatsApp).
 *
 * Il report include:
 *   • Dati anagrafici (nome, compleanno se presente)
 *   • Profilo medico (gruppo sang., allergie, condizioni, contatti emergenza, medico)
 *   • Terapia in corso (medicine attive con dose + orari)
 *   • Ultimi 7 giorni di diario (mood / sonno / appetito / note)
 */
export default function CareReportShare({ member, onClose }) {
  const { t } = useT();
  const [profile, setProfile] = useState(null);
  const [meds, setMeds] = useState([]);
  const [diary, setDiary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Genera l'immagine A4-style per il medico (con grafici 30gg + QR FAMMY)
  // e la condivide via share sheet (fallback: download).
  const exportDoctorImage = async () => {
    setGenerating(true);
    try {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data: diary30 } = await supabase
        .from('daily_diary').select('*').eq('member_id', member.id)
        .gte('diary_date', toLocalYMD(since))
        .order('diary_date', { ascending: true });
      const blob = await generateDoctorReport({
        member, profile, meds, diary: diary30 || [], t,
      });
      const fileName = `fammy-report-${(member.name || 'report').toLowerCase().replace(/\s+/g, '-')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t('crs_title') || 'Report sanitario FAMMY',
        }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch (e) {
      console.warn('[doctorReport] export error:', e);
    }
    setGenerating(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(); since.setDate(since.getDate() - 7);
      const [mp, md, dd] = await Promise.all([
        supabase.from('medical_profiles').select('*').eq('member_id', member.id).maybeSingle(),
        supabase.from('medications').select('*').eq('member_id', member.id).eq('active', true).order('created_at'),
        supabase.from('daily_diary').select('*').eq('member_id', member.id)
          .gte('diary_date', toLocalYMD(since))
          .order('diary_date', { ascending: false }),
      ]);
      if (cancelled) return;
      setProfile(mp.data || null);
      setMeds(md.data || []);
      setDiary(dd.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [member.id]);

  // Genera il report quando i dati sono pronti
  useEffect(() => {
    if (loading) return;
    const lines = [];
    lines.push(`🩺 ${t('crs_title') || 'Report sanitario FAMMY'}`);
    lines.push(`👤 ${member.name}`);
    if (member.birthday) {
      lines.push(`🎂 ${new Date(member.birthday).toLocaleDateString()}`);
    }
    lines.push(`📅 ${new Date().toLocaleDateString()}`);
    lines.push('');

    if (profile) {
      lines.push(`━━━ ${t('crs_section_profile') || 'PROFILO MEDICO'} ━━━`);
      if (profile.blood_type) lines.push(`🩸 ${t('mp_blood_type') || 'Gruppo'}: ${profile.blood_type}`);
      if (profile.allergies?.length) lines.push(`💊 ${t('mp_allergies_label') || 'Allergie farmaci'}: ${profile.allergies.join(', ')}`);
      if (profile.food_intolerances?.length) lines.push(`🥗 ${t('mp_food_label') || 'Allergie alimentari'}: ${profile.food_intolerances.join(', ')}`);
      if (profile.conditions) lines.push(`📋 ${t('mp_conditions_label') || 'Patologie'}: ${profile.conditions}`);
      if (profile.emergency_contact_name || profile.emergency_contact_phone) {
        lines.push(`🚨 ${t('mp_emergency_contact') || 'Emergenza'}: ${profile.emergency_contact_name || ''}${profile.emergency_contact_relation ? ` (${profile.emergency_contact_relation})` : ''} ${profile.emergency_contact_phone || ''}`.trim());
      }
      if (profile.doctor_name || profile.doctor_phone) {
        lines.push(`🩺 ${t('mp_doctor_h') || 'Medico'}: ${profile.doctor_name || ''} ${profile.doctor_phone || ''}`.trim());
      }
      if (profile.health_card_number) lines.push(`🆔 ${t('mp_health_card_label') || 'Tessera'}: ${profile.health_card_number}`);
      if (profile.notes) lines.push(`📝 ${profile.notes}`);
      lines.push('');
    }

    if (meds.length > 0) {
      lines.push(`━━━ ${t('crs_section_meds') || 'TERAPIA IN CORSO'} ━━━`);
      meds.forEach((m) => {
        const times = Array.isArray(m.times_of_day) && m.times_of_day.length > 0
          ? m.times_of_day.join(', ')
          : (t('crs_med_as_needed') || 'al bisogno');
        lines.push(`💊 ${m.name}${m.dose ? ` · ${m.dose}` : ''} · ${times}${m.notes ? ` · ${m.notes}` : ''}`);
      });
      lines.push('');
    }

    if (diary.length > 0) {
      lines.push(`━━━ ${t('crs_section_diary') || 'DIARIO ULTIMI 7 GIORNI'} ━━━`);
      const moodEmoji = (v) => (['', '😢', '😕', '😐', '🙂', '😄'][v] || '—');
      const appetiteLabel = (v) => ([
        '—',
        t('dd_appetite_low') || 'poco',
        t('dd_appetite_med') || 'normale',
        t('dd_appetite_high') || 'tanto',
      ][v] || '—');
      diary.forEach((d) => {
        const parts = [
          new Date(d.diary_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
          d.mood != null && moodEmoji(d.mood),
          d.bp_systolic != null && d.bp_diastolic != null && `🩺 ${d.bp_systolic}/${d.bp_diastolic}`,
          d.sleep_hours != null && `💤 ${d.sleep_hours}h`,
          d.appetite != null && `🍽️ ${appetiteLabel(d.appetite)}`,
          d.weight_kg != null && `⚖️ ${d.weight_kg}kg`,
        ].filter(Boolean);
        lines.push(`📓 ${parts.join(' · ')}`);
        if (d.notes) lines.push(`   ${d.notes}`);
      });
      lines.push('');
    }

    lines.push(`— ${t('crs_footer') || 'Generato da FAMMY'} —`);
    setReport(lines.join('\n'));
  }, [loading, profile, meds, diary, member, t]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { /* noop */ }
  };

  const shareNative = async () => {
    if (!navigator.share) return copyToClipboard();
    try {
      await navigator.share({
        title: t('crs_title') || 'Report sanitario FAMMY',
        text: report,
      });
    } catch (e) { /* utente ha annullato */ }
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(report)}`;
    openExternal(url);
  };

  const shareEmail = () => {
    const subject = encodeURIComponent(`${t('crs_title') || 'Report sanitario FAMMY'} · ${member.name}`);
    const body = encodeURIComponent(report);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div
      className="modal-bg"
      onClick={onClose}
      data-testid="care-report-share-backdrop"
      style={{
        position: 'fixed', inset: 0, zIndex: 1600,
        background: 'rgba(28,22,17,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="care-report-share-sheet"
        style={{
          width: '100%', maxWidth: 560,
          background: 'white',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
          maxHeight: '90vh', overflowY: 'auto',
          animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
        }}>
        <div style={{
          width: 40, height: 4, borderRadius: 4, background: 'var(--sm)',
          margin: '0 auto 12px',
        }} />

        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>
          📤 {t('crs_share_h') || 'Condividi report sanitario'}
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--km)' }}>
          {t('crs_share_p') || 'Includi profilo medico, terapia e ultimi 7 giorni di diario.'}
        </p>

        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--km)' }}>
            {t('loading') || 'Caricamento…'}
          </div>
        ) : (
          <>
            {/* Report per il medico: immagine A4 con grafici + QR FAMMY */}
            <button
              type="button"
              onClick={exportDoctorImage}
              disabled={generating}
              data-testid="care-report-doctor-btn"
              style={{
                width: '100%', marginBottom: 12,
                padding: '14px', borderRadius: 12,
                border: 'none', background: 'var(--k)', color: 'white',
                fontSize: 14, fontWeight: 800,
                cursor: generating ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              }}>
              {generating
                ? (t('crs_doctor_generating') || 'Genero il report…')
                : <>🧑‍⚕️ {t('crs_doctor_btn') || 'Report per il medico (immagine)'}</>}
            </button>
            <p style={{ margin: '-6px 0 14px', fontSize: 11, color: 'var(--km)', textAlign: 'center' }}>
              {t('crs_doctor_hint') || 'Documento con grafici degli ultimi 30 giorni, pronto da inviare al dottore.'}
            </p>
            <textarea
              readOnly
              value={report}
              data-testid="care-report-textarea"
              style={{
                width: '100%', minHeight: 180, maxHeight: 280,
                padding: 10, borderRadius: 10, border: '1px solid var(--sm)',
                fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace',
                background: 'var(--ab)', color: 'var(--k)',
                resize: 'vertical', marginBottom: 12,
                lineHeight: 1.5,
              }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                onClick={copyToClipboard}
                data-testid="care-report-copy-btn"
                style={btnStyle('var(--ac)')}>
                {copied ? '✓ ' + (t('copied') || 'Copiato') : '📋 ' + (t('crs_copy') || 'Copia')}
              </button>
              {typeof navigator !== 'undefined' && navigator.share && (
                <button
                  type="button"
                  onClick={shareNative}
                  data-testid="care-report-share-native-btn"
                  style={btnStyle('var(--k)')}>
                  📲 {t('crs_share_native') || 'Condividi…'}
                </button>
              )}
              <button
                type="button"
                onClick={shareWhatsApp}
                data-testid="care-report-whatsapp-btn"
                style={btnStyle('#25D366')}>
                💬 WhatsApp
              </button>
              <button
                type="button"
                onClick={shareEmail}
                data-testid="care-report-email-btn"
                style={btnStyle('#1A73E8')}>
                📧 Email
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              data-testid="care-report-close-btn"
              style={{
                marginTop: 12, width: '100%',
                padding: '12px', borderRadius: 12,
                border: '1px solid var(--sm)', background: 'white',
                fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
              }}>
              {t('close') || 'Chiudi'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    padding: '12px 14px',
    background: color, color: 'white',
    border: 'none', borderRadius: 12,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    boxShadow: `0 4px 12px ${color}33`,
  };
}
