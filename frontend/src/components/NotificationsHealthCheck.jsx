import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * Diagnostica notifiche push — health-check completo.
 *
 * Esegue all'apertura una serie di controlli automatici e mostra
 * ✅/⚠️/❌ per ognuno. Permette di rilanciarli e di inviare una push
 * di prova al device corrente.
 *
 * Controlli:
 *  1. Browser supporta Push API + Service Worker + Notification
 *  2. VAPID public key configurata (env var Vite)
 *  3. Notification.permission === 'granted'
 *  4. Service Worker installato e attivo (registration.active)
 *  5. PushManager.getSubscription() ritorna una subscription valida
 *  6. Riga in `push_subscriptions` per il mio user_id (DB)
 *  7. iOS PWA standalone (solo se iOS Safari)
 *  8. Test push: chiama `send-push` e verifica `sent > 0`
 */
export default function NotificationsHealthCheck({ session }) {
  const { t } = useT();
  const [checks, setChecks] = useState(() => initialChecks());
  const [running, setRunning] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  // Collassabile: chiuso di default. Si auto-apre la prima volta se
  // rileva errori, così l'utente è "spinto" a vedere il problema.
  const [open, setOpen] = useState(false);
  const [didAutoOpen, setDidAutoOpen] = useState(false);

  const userId = session?.user?.id;

  // OS detection
  const isIOS = typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  const isAndroid = typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent || '');
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true
  );

  const runAll = useCallback(async () => {
    if (!userId) return;
    setRunning(true);
    const next = initialChecks();

    // 1) Browser support
    const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    const hasPush = typeof window !== 'undefined' && 'PushManager' in window;
    const hasNotif = typeof Notification !== 'undefined';
    setStatus(next, 'browser', (hasSW && hasPush && hasNotif) ? 'ok' : 'err',
      (hasSW && hasPush && hasNotif)
        ? t('nhc_browser_ok')
        : t('nhc_browser_err'));

    // 2) VAPID key configured
    const hasVapid = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;
    setStatus(next, 'vapid', hasVapid ? 'ok' : 'err',
      hasVapid ? t('nhc_vapid_ok') : t('nhc_vapid_err'));

    // 3) Notification permission
    const perm = hasNotif ? Notification.permission : 'unsupported';
    setStatus(next, 'perm',
      perm === 'granted' ? 'ok' : (perm === 'denied' ? 'err' : 'warn'),
      perm === 'granted' ? t('nhc_perm_ok')
        : perm === 'denied' ? t('nhc_perm_denied')
        : perm === 'default' ? t('nhc_perm_default')
        : t('nhc_perm_unsupported'));

    // 4) Service Worker attivo
    let registration = null;
    if (hasSW) {
      try {
        registration = await navigator.serviceWorker.getRegistration();
        const isActive = !!(registration?.active);
        setStatus(next, 'sw', isActive ? 'ok' : 'warn',
          isActive ? t('nhc_sw_ok') : t('nhc_sw_no_active'));
      } catch (e) {
        setStatus(next, 'sw', 'err', t('nhc_sw_err'));
      }
    } else {
      setStatus(next, 'sw', 'err', t('nhc_sw_unsupported'));
    }

    // 5) Subscription locale
    let localSub = null;
    if (registration && hasPush) {
      try {
        localSub = await registration.pushManager.getSubscription();
        const expired = localSub?.expirationTime && localSub.expirationTime < Date.now();
        if (!localSub) {
          setStatus(next, 'localsub', 'err', t('nhc_localsub_missing'));
        } else if (expired) {
          setStatus(next, 'localsub', 'err', t('nhc_localsub_expired'));
        } else {
          setStatus(next, 'localsub', 'ok', t('nhc_localsub_ok'));
        }
      } catch (e) {
        setStatus(next, 'localsub', 'err', t('nhc_localsub_err'));
      }
    } else {
      setStatus(next, 'localsub', 'err', t('nhc_localsub_no_sw'));
    }

    // 6) Riga in push_subscriptions su DB
    try {
      // SELECT minimale per essere resiliente a vecchi schemi DB che
      // potrebbero NON avere ancora colonne come `last_used_at` o
      // `user_agent` (aggiunte in migrazioni successive).
      const { data: rows, error } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint')
        .eq('user_id', userId);
      if (error) throw error;
      const n = (rows || []).length;
      // Verifica match con la subscription locale (endpoint identico)
      const localEndpoint = localSub?.endpoint || null;
      const matched = !!(localEndpoint && rows?.some((r) => r.endpoint === localEndpoint));
      if (n === 0) {
        setStatus(next, 'dbsub', 'err', t('nhc_dbsub_none'));
      } else if (localEndpoint && !matched) {
        setStatus(next, 'dbsub', 'warn', t('nhc_dbsub_mismatch', { n }));
      } else {
        setStatus(next, 'dbsub', 'ok', t('nhc_dbsub_ok', { n }));
      }
    } catch (e) {
      setStatus(next, 'dbsub', 'err', `${t('nhc_dbsub_err')}: ${e?.message || ''}`);
    }

    // 7) iOS PWA standalone
    if (isIOS) {
      setStatus(next, 'ios_pwa', isStandalone ? 'ok' : 'err',
        isStandalone ? t('nhc_ios_pwa_ok') : t('nhc_ios_pwa_err'));
    } else {
      setStatus(next, 'ios_pwa', 'skip', t('nhc_ios_pwa_skip'));
    }

    // Aggiorna lo stato UNA SOLA volta a fine batch
    setChecks(next);
    setRunning(false);
  }, [userId, isIOS, isStandalone, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runAll();
  }, [runAll]);

  // Test push end-to-end (send-push edge function)
  const sendTestPush = async () => {
    if (!userId) return;
    setTestRunning(true);
    setTestResult(null);
    let result = { tone: 'warn', msg: t('nhc_test_unknown') };
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
          user_id: userId,
          title: t('nhc_test_push_title'),
          body: t('nhc_test_push_body'),
          tag: 'nhc-test',
        }),
      });
      let data = {};
      try { data = await res.json(); } catch (_) { /* response non-JSON */ }
      if (res.status === 404) {
        result = { tone: 'err', msg: t('nhc_test_404') };
      } else if (data?.sent && data.sent > 0) {
        result = { tone: 'ok', msg: t('nhc_test_ok', { n: data.sent }) };
      } else if (data?.reason === 'no_subscriptions') {
        result = { tone: 'warn', msg: t('nhc_test_no_subs') };
      } else if (!res.ok) {
        result = { tone: 'err', msg: data?.error || `HTTP ${res.status}` };
      } else {
        result = { tone: 'warn', msg: data?.error || t('nhc_test_unknown') };
      }
    } catch (e) {
      result = { tone: 'err', msg: e?.message || String(e) };
    }
    setTestResult(result);
    setTestRunning(false);
  };

  // Calcolo riassunto (usato sia dall'effetto auto-open sia dal render)
  const failingErr = checks.filter((c) => c.status === 'err').length;
  const failingWarn = checks.filter((c) => c.status === 'warn').length;
  const allOk = failingErr === 0 && failingWarn === 0 && !running;

  // Auto-open la prima volta se ci sono errori (così l'utente è "spinto"
  // a vedere subito il problema). Successivi rerun non riaprono il box
  // automaticamente: rispettiamo la scelta di chiuderlo.
  useEffect(() => {
    if (!didAutoOpen && !running && failingErr > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
      setDidAutoOpen(true);
    }
  }, [didAutoOpen, running, failingErr]);

  if (!userId) return null;

  // Stato del badge header
  const badgeBg = running ? 'var(--ab)'
    : allOk ? 'var(--gnB)'
    : failingErr > 0 ? '#FDECEC'
    : '#FFF6E5';
  const badgeFg = running ? 'var(--km)'
    : allOk ? 'var(--gn)'
    : failingErr > 0 ? '#A93B2B'
    : '#7A4E00';
  const badgeText = running ? `⏳ ${t('nhc_refresh')}…`
    : allOk ? `✅ ${t('nhc_badge_ok')}`
    : failingErr > 0 ? `❌ ${t('nhc_badge_err', { n: failingErr })}`
    : `⚠️ ${t('nhc_badge_warn', { n: failingWarn })}`;

  return (
    <div style={{
      background: 'var(--ab)', borderRadius: 12,
      border: '1px solid var(--sd)', marginTop: 8,
      overflow: 'hidden',
    }} data-testid="notif-health-check">
      {/* Header sempre visibile: titolo + badge stato + chevron */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="nhc-header-toggle"
        aria-expanded={open}
        style={{
          width: '100%', padding: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--k)', flexShrink: 0 }}>
          {t('nhc_h')}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          <span style={{
            padding: '4px 10px', borderRadius: 100,
            background: badgeBg, color: badgeFg,
            fontSize: 11, fontWeight: 800, lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }} data-testid="nhc-badge">{badgeText}</span>
          <span style={{
            color: 'var(--km)', fontSize: 14,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms ease',
            display: 'inline-block',
          }} aria-hidden="true">⌄</span>
        </div>
      </button>

      {/* Corpo collassabile */}
      {open && (
        <div style={{ padding: '0 12px 12px 12px' }} data-testid="nhc-body">
          <div style={{
            display: 'flex', justifyContent: 'flex-end', marginBottom: 10,
          }}>
            <button type="button" onClick={runAll} disabled={running}
              data-testid="nhc-refresh"
              style={{
                padding: '4px 10px', border: '1px solid var(--sm)', borderRadius: 100,
                background: 'white', cursor: running ? 'wait' : 'pointer',
                fontSize: 11, color: 'var(--km)', fontWeight: 600,
              }}>
              {running ? '…' : '↻ ' + t('nhc_refresh')}
            </button>
          </div>

          {/* Lista controlli */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {checks.filter((c) => c.status !== 'skip').map((c) => (
              <CheckRow key={c.key} check={c} t={t} />
            ))}
          </div>

          {/* Bottone test push */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--sm)' }}>
            <button type="button" onClick={sendTestPush} disabled={testRunning}
              data-testid="nhc-test-push-btn"
              className="btn full secondary"
              style={{ fontSize: 13, padding: '10px 14px', fontWeight: 700 }}>
              {testRunning ? <span className="spin dark" /> : `🧪 ${t('nhc_test_btn')}`}
            </button>
            {testResult && (
              <div style={{
                marginTop: 8, padding: '8px 10px', borderRadius: 8,
                background: testResult.tone === 'ok' ? 'var(--gnB)'
                  : testResult.tone === 'warn' ? '#FFF6E5' : '#FDECEC',
                color: testResult.tone === 'ok' ? 'var(--gn)'
                  : testResult.tone === 'warn' ? '#7A4E00' : '#A93B2B',
                fontSize: 12, fontWeight: 600, lineHeight: 1.45,
              }} data-testid="nhc-test-push-result">
                {testResult.tone === 'ok' ? '✅ ' : testResult.tone === 'warn' ? '⚠️ ' : '❌ '}
                {testResult.msg}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--km)', lineHeight: 1.5 }}>
              {t('nhc_test_hint')}
            </div>
          </div>

          {/* Hint OS-specifici quando ci sono errori */}
          {!allOk && (isIOS || isAndroid) && (
            <details style={{ marginTop: 10 }}>
              <summary style={{
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                color: 'var(--ac)', userSelect: 'none',
              }} data-testid="nhc-os-hints-toggle">
                {isIOS ? `📱 ${t('nhc_os_hints_ios')}` : `📱 ${t('nhc_os_hints_android')}`}
              </summary>
              <div style={{
                marginTop: 8, padding: 10, borderRadius: 8,
                background: 'var(--s)', border: '1px solid var(--sm)',
                fontSize: 12, lineHeight: 1.5, color: 'var(--k)',
              }}>
                {isIOS && (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li>{t('nhc_hint_ios_install')}</li>
                    <li>{t('nhc_hint_ios_focus')}</li>
                    <li>{t('nhc_hint_ios_safari_only')}</li>
                  </ul>
                )}
                {isAndroid && (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    <li>{t('nhc_hint_android_battery')}</li>
                    <li>{t('nhc_hint_android_bg')}</li>
                    <li>{t('nhc_hint_android_perm')}</li>
                  </ul>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check, t }) {
  const icon = check.status === 'ok' ? '✅'
    : check.status === 'warn' ? '⚠️'
    : check.status === 'err' ? '❌'
    : '⏳';
  const color = check.status === 'ok' ? 'var(--gn)'
    : check.status === 'warn' ? '#9A6300'
    : check.status === 'err' ? '#A93B2B'
    : 'var(--km)';
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      fontSize: 12, lineHeight: 1.45,
    }} data-testid={`nhc-row-${check.key}`}>
      <span style={{ flexShrink: 0, fontSize: 14 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: 'var(--k)' }}>
          {t(check.labelKey)}
        </div>
        {check.detail && (
          <div style={{ color, marginTop: 2, fontSize: 11.5 }}>
            {check.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function initialChecks() {
  return [
    { key: 'browser',  labelKey: 'nhc_lbl_browser',  status: 'pending', detail: '' },
    { key: 'vapid',    labelKey: 'nhc_lbl_vapid',    status: 'pending', detail: '' },
    { key: 'perm',     labelKey: 'nhc_lbl_perm',     status: 'pending', detail: '' },
    { key: 'sw',       labelKey: 'nhc_lbl_sw',       status: 'pending', detail: '' },
    { key: 'localsub', labelKey: 'nhc_lbl_localsub', status: 'pending', detail: '' },
    { key: 'dbsub',    labelKey: 'nhc_lbl_dbsub',    status: 'pending', detail: '' },
    { key: 'ios_pwa',  labelKey: 'nhc_lbl_ios_pwa',  status: 'pending', detail: '' },
  ];
}

function setStatus(arr, key, status, detail) {
  const idx = arr.findIndex((c) => c.key === key);
  if (idx >= 0) arr[idx] = { ...arr[idx], status, detail };
}
