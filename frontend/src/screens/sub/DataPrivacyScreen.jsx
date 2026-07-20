import { useState } from 'react';
import { toLocalYMD } from '../../lib/dateUtils.js';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import PrivacyPolicyModal from '../../components/PrivacyPolicyModal.jsx';

/**
 * DataPrivacyScreen — GDPR rights for the logged-in user.
 *
 * Three actions:
 *  • Re-open the cookie banner (Art. 7 — right to withdraw consent)
 *  • Export my data as JSON (Art. 15 + 20 — right of access & portability)
 *  • Delete my account & data (Art. 17 — right to erasure)
 *
 * Account deletion calls the Supabase RPC `delete_my_account()` defined in
 * `frontend/fammy-gdpr-delete.sql`. The RPC cascades through families/members/
 * tasks/events/expenses owned by the user and finishes by removing the auth
 * row. After it returns we sign out locally.
 */
export default function DataPrivacyScreen({ session, onBack }) {
  const { t } = useT();
  const [busyExport, setBusyExport] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const reopenConsent = () => {
    try { localStorage.removeItem('fammy_consent'); } catch (e) {}
    window.dispatchEvent(new Event('fammy:openConsent'));
  };

  const exportData = async () => {
    setBusyExport(true); setErr(''); setOk('');
    try {
      const uid = session.user.id;

      const fetchAll = async (table, query) => {
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        return data || [];
      };

      // 1) profile + 2) families I own/joined + 3) data within those families
      const profile = await fetchAll('profiles',
        supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
          .then((r) => ({ data: r.data ? [r.data] : [], error: r.error })));

      const myMembers = await fetchAll('members',
        supabase.from('members').select('*').eq('user_id', uid));

      const familyIds = [...new Set(myMembers.map((m) => m.family_id))];

      const families = familyIds.length
        ? await fetchAll('families', supabase.from('families').select('*').in('id', familyIds))
        : [];
      const allMembers = familyIds.length
        ? await fetchAll('members', supabase.from('members').select('*').in('family_id', familyIds))
        : [];
      const tasks = familyIds.length
        ? await fetchAll('tasks', supabase.from('tasks').select('*').in('family_id', familyIds))
        : [];
      const events = familyIds.length
        ? await fetchAll('events', supabase.from('events').select('*').in('family_id', familyIds))
        : [];
      const expenses = familyIds.length
        ? await fetchAll('expenses', supabase.from('expenses').select('*').in('family_id', familyIds))
        : [];

      const bundle = {
        exported_at: new Date().toISOString(),
        user_id: uid,
        user_email: session.user.email,
        profile,
        families,
        members: allMembers,
        tasks,
        events,
        expenses,
        notice:
          'This file is your FAMMY data export under GDPR Art. 15 & 20. ' +
          'It includes data from families you are a member of. ' +
          'Other members\' personal data is included only insofar as it is shared with you inside the family.',
      };

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = toLocalYMD();
      a.href = url;
      a.download = `fammy-data-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setOk(t('gdpr_export_done'));
    } catch (e) {
      setErr(e.message || 'Error');
    } finally {
      setBusyExport(false);
    }
  };

  const deleteAccount = async () => {
    setBusyDelete(true); setErr('');
    try {
      // The RPC handles the cascade in a single SECURITY DEFINER transaction.
      const { error } = await supabase.rpc('delete_my_account');
      if (error) {
        // Fallback: the SQL function may not be installed yet. Surface a clear
        // instruction so the user (or their dev) can install it once.
        if (/function .* does not exist|delete_my_account/i.test(error.message)) {
          throw new Error(t('gdpr_delete_rpc_missing'));
        }
        throw new Error(error.message);
      }
      // Sign out locally — any leftover session is invalid anyway.
      await supabase.auth.signOut();
      // Hard reload to clear all in-memory state
      window.location.href = '/';
    } catch (e) {
      setErr(e.message || 'Error');
      setBusyDelete(false);
    }
  };

  return (
    <div className="profile-screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} className="profile-back" data-testid="gdpr-back">‹ {t('back')}</button>
        <button onClick={onBack} aria-label="Chiudi" data-testid="gdpr-close"
          style={{
            width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--sm)',
            background: 'var(--s)', color: 'var(--km)', fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
      </div>

      <h1 className="profile-h">{t('gdpr_h')}</h1>
      <p style={{ fontSize: 13, color: 'var(--km)', marginBottom: 22, lineHeight: 1.5 }}>
        {t('gdpr_intro')}
      </p>

      {/* Privacy policy link */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>{t('gdpr_policy_label')}</div>
        <p style={{ fontSize: 13, color: 'var(--km)', margin: '0 0 12px', lineHeight: 1.4 }}>
          {t('gdpr_policy_sub')}
        </p>
        <a
          href="/privacy.html"
          target="_blank"
          rel="noopener"
          className="btn full secondary"
          data-testid="gdpr-open-policy"
          style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
        >
          📄 {t('gdpr_policy_btn')}
        </a>
      </div>

      {/* Re-open consent banner */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>🍪 {t('gdpr_consent_label')}</div>
        <p style={{ fontSize: 13, color: 'var(--km)', margin: '0 0 12px', lineHeight: 1.4 }}>
          {t('gdpr_consent_sub')}
        </p>
        <button
          type="button"
          className="btn full secondary"
          onClick={reopenConsent}
          data-testid="gdpr-reopen-consent"
        >
          {t('gdpr_consent_btn')}
        </button>
      </div>

      {/* Export */}
      <div className="profile-section">
        <div className="profile-label" style={{ marginBottom: 8 }}>📦 {t('gdpr_export_label')}</div>
        <p style={{ fontSize: 13, color: 'var(--km)', margin: '0 0 12px', lineHeight: 1.4 }}>
          {t('gdpr_export_sub')}
        </p>
        <button
          type="button"
          className="btn full"
          disabled={busyExport}
          onClick={exportData}
          data-testid="gdpr-export-btn"
        >
          {busyExport ? <span className="spin" /> : t('gdpr_export_btn')}
        </button>
      </div>

      {/* Delete account */}
      <div className="profile-section" style={{ borderBottom: 'none' }}>
        <div className="profile-label" style={{ marginBottom: 8, color: 'var(--rd)' }}>
          ⚠️ {t('gdpr_delete_label')}
        </div>
        <p style={{ fontSize: 13, color: 'var(--km)', margin: '0 0 12px', lineHeight: 1.5 }}>
          {t('gdpr_delete_sub')}
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            className="btn full danger"
            onClick={() => setConfirmDelete(true)}
            data-testid="gdpr-delete-init"
          >
            🗑️ {t('gdpr_delete_btn')}
          </button>
        ) : (
          <div style={{
            padding: 14, border: '2px solid var(--rd)', borderRadius: 16,
            background: 'var(--rdB)',
          }}>
            <p style={{ fontSize: 13, color: 'var(--k)', marginBottom: 12, lineHeight: 1.5, fontWeight: 600 }}>
              {t('gdpr_delete_confirm_p')}
            </p>
            <input
              className="input"
              placeholder={t('gdpr_delete_type_ph')}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              data-testid="gdpr-delete-type"
              style={{ marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn secondary"
                style={{ flex: 1 }}
                disabled={busyDelete}
                onClick={() => { setConfirmDelete(false); setConfirmText(''); }}
                data-testid="gdpr-delete-cancel"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn danger"
                style={{ flex: 1 }}
                disabled={busyDelete || confirmText.toUpperCase().trim() !== 'DELETE'}
                onClick={deleteAccount}
                data-testid="gdpr-delete-confirm"
              >
                {busyDelete ? <span className="spin" /> : t('gdpr_delete_final_btn')}
              </button>
            </div>
          </div>
        )}
      </div>

      {err && <div className="login-msg error" style={{ whiteSpace: 'pre-wrap' }}>{err}</div>}
      {ok && <div className="login-msg" style={{ background: 'var(--gnB)', color: 'var(--gn)', border: '1px solid var(--gn)' }}>{ok}</div>}

      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}
