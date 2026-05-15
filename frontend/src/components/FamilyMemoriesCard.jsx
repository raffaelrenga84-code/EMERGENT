import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * FamilyMemoriesCard — galleria mensile automatica delle foto dei task done
 * e degli eventi del mese. Lightbox click-to-zoom, navigazione mese ← →.
 *
 * Tiene la query batch: 1 select su task_attachments + 1 su event_attachments,
 * con range temporale sul created_at delle photo o sul done/event date.
 */
export default function FamilyMemoriesCard({ familyIds = [], compact = false }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const monthStart = month;
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const monthName = month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const isCurrentMonth = (() => {
    const now = new Date();
    return month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  })();

  useEffect(() => {
    let cancelled = false;
    if (familyIds.length === 0) { setPhotos([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      // 1) Task attachments del mese: join con tasks per filtrare per famiglia + done
      const { data: taskAtts } = await supabase
        .from('task_attachments')
        .select('id, file_path, file_name, created_at, task_id, tasks!inner(family_id, status, title)')
        .in('tasks.family_id', familyIds)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', monthEnd.toISOString())
        .order('created_at', { ascending: false })
        .limit(60);

      // 2) Event attachments del mese
      const { data: eventAtts } = await supabase
        .from('event_attachments')
        .select('id, file_path, file_name, created_at, event_id, events!inner(family_id, title, starts_at)')
        .in('events.family_id', familyIds)
        .gte('created_at', monthStart.toISOString())
        .lt('created_at', monthEnd.toISOString())
        .order('created_at', { ascending: false })
        .limit(60);

      const combined = [
        ...((taskAtts || []).map((a) => ({
          id: `t-${a.id}`, kind: 'task', bucket: 'task-attachments',
          file_path: a.file_path, file_name: a.file_name,
          title: a.tasks?.title || 'Incarico', created_at: a.created_at,
        }))),
        ...((eventAtts || []).map((a) => ({
          id: `e-${a.id}`, kind: 'event', bucket: 'event-attachments',
          file_path: a.file_path, file_name: a.file_name,
          title: a.events?.title || 'Evento', created_at: a.created_at,
        }))),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (cancelled) return;
      setPhotos(combined);

      // Genera signed URLs (bucket privati)
      const urls = {};
      await Promise.all(combined.map(async (p) => {
        const { data: sig } = await supabase.storage.from(p.bucket).createSignedUrl(p.file_path, 60 * 60);
        if (sig?.signedUrl) urls[p.id] = sig.signedUrl;
      }));

      if (!cancelled) {
        setPhotoUrls(urls);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month.getFullYear(), month.getMonth(), familyIds.join(',')]);

  const prevMonth = () => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const nextMonth = () => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  const openLightbox = (idx) => { setLightboxIdx(idx); setLightbox(photos[idx]); };
  const closeLightbox = () => setLightbox(null);
  const navLightbox = (dir) => {
    const next = (lightboxIdx + dir + photos.length) % photos.length;
    setLightboxIdx(next); setLightbox(photos[next]);
  };

  // Heading emoji a seconda del mese
  const monthEmoji = ['❄️', '💝', '🌷', '🌸', '🌺', '☀️', '🏖️', '🌻', '🍂', '🎃', '🍁', '🎄'][month.getMonth()];

  return (
    <div className="card" data-testid="family-memories-card" style={{
      borderRadius: 16, padding: 16,
      background: 'linear-gradient(135deg, var(--ab) 0%, white 100%)',
      border: '1px solid var(--sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            📸 Ricordi di famiglia
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--k)', textTransform: 'capitalize' }}>
            {monthEmoji} {monthName}
          </div>
        </div>
        <button type="button" onClick={prevMonth}
          data-testid="memories-prev-month"
          style={navBtnStyle}>‹</button>
        <button type="button" onClick={nextMonth} disabled={isCurrentMonth}
          data-testid="memories-next-month"
          style={{ ...navBtnStyle, opacity: isCurrentMonth ? 0.3 : 1 }}>›</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--km)', padding: 20, textAlign: 'center' }}>
          Caricamento ricordi…
        </div>
      ) : photos.length === 0 ? (
        <div style={{ padding: '20px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.5 }}>
            Nessuna foto questo mese.<br />
            <span style={{ fontSize: 12, opacity: 0.7 }}>Allega una foto a un incarico o evento per iniziare la tua galleria!</span>
          </div>
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${compact ? 4 : 3}, 1fr)`,
            gap: 6,
          }} data-testid="memories-grid">
            {photos.slice(0, compact ? 8 : 12).map((p, idx) => (
              <button key={p.id} type="button" onClick={() => openLightbox(idx)}
                data-testid={`memory-photo-${p.id}`}
                style={{
                  aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
                  border: '1px solid var(--sm)', padding: 0, background: 'var(--ab)',
                  cursor: 'zoom-in', position: 'relative',
                }}>
                {photoUrls[p.id] ? (
                  <img src={photoUrls[p.id]} alt={p.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 24,
                  }}>🖼️</div>
                )}
                <span style={{
                  position: 'absolute', bottom: 4, left: 4,
                  background: 'rgba(0,0,0,0.55)', color: 'white',
                  fontSize: 9, padding: '1px 5px', borderRadius: 4,
                }}>
                  {p.kind === 'task' ? '📋' : '📅'}
                </span>
              </button>
            ))}
          </div>
          {photos.length > (compact ? 8 : 12) && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--km)', textAlign: 'center' }}>
              +{photos.length - (compact ? 8 : 12)} altre foto questo mese
            </div>
          )}
        </>
      )}

      {/* Lightbox con navigazione */}
      {lightbox && (
        <div onClick={closeLightbox} data-testid="memories-lightbox" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
          zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, cursor: 'zoom-out', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ color: 'white', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
            {lightbox.kind === 'task' ? '📋' : '📅'} {lightbox.title}
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
              {new Date(lightbox.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <img src={photoUrls[lightbox.id]} style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8 }} alt="" />
          {photos.length > 1 && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={(e) => { e.stopPropagation(); navLightbox(-1); }}
                style={lightboxBtnStyle}>‹</button>
              <span style={{ color: 'white', fontSize: 12, alignSelf: 'center', opacity: 0.7 }}>
                {lightboxIdx + 1} / {photos.length}
              </span>
              <button onClick={(e) => { e.stopPropagation(); navLightbox(1); }}
                style={lightboxBtnStyle}>›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const navBtnStyle = {
  width: 30, height: 30, borderRadius: '50%',
  border: '1px solid var(--sm)', background: 'white',
  fontSize: 16, fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const lightboxBtnStyle = {
  width: 40, height: 40, borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
  color: 'white', fontSize: 20, fontWeight: 700, cursor: 'pointer',
};
