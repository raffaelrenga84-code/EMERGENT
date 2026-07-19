import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * NotificationBell — 🔔 centro notifiche in header.
 * Storico persistente (tabella `notifications`, scritta da send-push per
 * TUTTE le push), badge non-lette, pannello con "segna tutte come lette".
 * Le notifiche lette restano rileggibili: niente piu' notifiche perse.
 */
export default function NotificationBell() {
  const { t: __t0, lang } = useT();
  const t = (k) => { const v = __t0(k); return v === k ? '' : v; };
  const [userId, setUserId] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  const load = async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, tag, data, created_at, read_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      setNotifs(data || []);
    } catch (_) { /* migration non ancora eseguita */ }
  };

  useEffect(() => {
    load();
    // Aggiorna quando l'app torna in foreground (nuove push nel frattempo)
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId]);

  const unread = notifs.filter((n) => !n.read_at).length;

  const openPanel = () => { setOpen(true); load(); };

  const markRead = async (n) => {
    if (n.read_at) return;
    setNotifs((p) => p.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
    await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', n.id).is('read_at', null);
  };

  const markAll = async () => {
    if (busy || unread === 0) return;
    setBusy(true);
    const now = new Date().toISOString();
    setNotifs((p) => p.map((x) => x.read_at ? x : { ...x, read_at: now }));
    await supabase.from('notifications')
      .update({ read_at: now })
      .eq('user_id', userId).is('read_at', null);
    setBusy(false);
  };

  const fmtWhen = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const hm = d.toLocaleTimeString(lang || 'it', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return hm;
    return d.toLocaleDateString(lang || 'it', { day: 'numeric', month: 'short' }) + ' · ' + hm;
  };

  return (
    <>
      <button type="button" onClick={openPanel}
        data-testid="header-notif-bell"
        aria-label={t('notif_h') || 'Notifiche'}
        title={t('notif_h') || 'Notifiche'}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'white', border: '1px solid var(--sm)',
          color: 'var(--km)', fontSize: 16, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, position: 'relative',
        }}>
        🔔
        {unread > 0 && (
          <span data-testid="notif-badge" style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 17, height: 17, padding: '0 4px', borderRadius: 100,
            background: 'var(--rd, #C1624B)', color: '#fff',
            fontSize: 10, fontWeight: 800, lineHeight: '17px',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, flex: 1 }}>🔔 {t('notif_h') || 'Notifiche'}</h2>
              {unread > 0 && (
                <button type="button" onClick={markAll} disabled={busy}
                  data-testid="notif-mark-all"
                  style={{
                    border: '1px solid var(--sm)', background: 'var(--s)',
                    borderRadius: 100, padding: '6px 11px', fontSize: 11.5,
                    fontWeight: 700, color: 'var(--ac)', cursor: 'pointer',
                  }}>
                  ✓ {t('notif_mark_all') || 'Segna tutte lette'}
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi"
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  border: '1px solid var(--sm)', background: 'var(--s)',
                  color: 'var(--km)', fontSize: 15, cursor: 'pointer',
                }}>✕</button>
            </div>

            {notifs.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--km)', fontSize: 13, padding: '28px 0' }}>
                {t('notif_empty') || 'Nessuna notifica ancora. Quando arriva qualcosa, lo ritrovi qui.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {notifs.map((n) => (
                  <button key={n.id} type="button" onClick={() => markRead(n)}
                    data-testid={'notif-item-' + n.id}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 12,
                      border: '1px solid ' + (n.read_at ? 'var(--sm)' : 'var(--ac)'),
                      background: n.read_at ? 'var(--s)' : 'var(--ab)',
                      cursor: 'pointer',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      {!n.read_at && <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: 'var(--ac)', flexShrink: 0, alignSelf: 'center',
                      }} />}
                      <span style={{
                        flex: 1, fontSize: 13.5, color: 'var(--k)',
                        fontWeight: n.read_at ? 600 : 800,
                      }}>{n.title}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--km)', whiteSpace: 'nowrap' }}>
                        {fmtWhen(n.created_at)}
                      </span>
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 3, lineHeight: 1.4 }}>
                        {n.body}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
