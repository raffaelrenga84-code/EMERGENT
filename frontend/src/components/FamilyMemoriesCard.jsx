import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import TaskDetailModal from './TaskDetailModal.jsx';
import EventDetailModal from './EventDetailModal.jsx';

/**
 * FamilyMemoriesCard — galleria mensile auto delle foto allegate
 * a task done e a eventi del mese.
 *
 * Click su foto → apre il TaskDetailModal o EventDetailModal corrispondente.
 * Filtro per famiglia (chip "Tutte" + chip per ogni famiglia) se l'utente
 * appartiene a più famiglie.
 */
export default function FamilyMemoriesCard({ families = [], members = [], me, compact = false }) {
  const familyIds = families.map((f) => f.id);
  const [filterFamily, setFilterFamily] = useState('all'); // 'all' | family.id
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [openTask, setOpenTask] = useState(null);
  const [openEvent, setOpenEvent] = useState(null);

  const activeFamilyIds = filterFamily === 'all'
    ? familyIds
    : familyIds.filter((id) => id === filterFamily);

  const monthStart = month;
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const monthName = month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const isCurrentMonth = (() => {
    const now = new Date();
    return month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  })();

  useEffect(() => {
    let cancelled = false;
    if (activeFamilyIds.length === 0) { setPhotos([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      const [taskAttsRes, eventAttsRes] = await Promise.all([
        supabase.from('task_attachments')
          .select('id, file_path, file_name, created_at, task_id, tasks!inner(id, family_id, status, title, category, due_date)')
          .in('tasks.family_id', activeFamilyIds)
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', monthEnd.toISOString())
          .order('created_at', { ascending: false })
          .limit(60),
        supabase.from('event_attachments')
          .select('id, file_path, file_name, created_at, event_id, events!inner(id, family_id, title, starts_at, description, location, created_by)')
          .in('events.family_id', activeFamilyIds)
          .gte('created_at', monthStart.toISOString())
          .lt('created_at', monthEnd.toISOString())
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      const combined = [
        ...((taskAttsRes.data || []).map((a) => ({
          id: `t-${a.id}`, kind: 'task', bucket: 'task-attachments',
          file_path: a.file_path, file_name: a.file_name,
          title: a.tasks?.title || 'Incarico', created_at: a.created_at,
          parent: a.tasks,
        }))),
        ...((eventAttsRes.data || []).map((a) => ({
          id: `e-${a.id}`, kind: 'event', bucket: 'event-attachments',
          file_path: a.file_path, file_name: a.file_name,
          title: a.events?.title || 'Evento', created_at: a.created_at,
          parent: a.events,
        }))),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (cancelled) return;
      setPhotos(combined);

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
  }, [month.getFullYear(), month.getMonth(), activeFamilyIds.join(',')]);

  const prevMonth = () => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const nextMonth = () => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  const openPhoto = (photo) => {
    if (photo.kind === 'task') setOpenTask(photo.parent);
    else setOpenEvent(photo.parent);
  };

  const monthEmoji = ['❄️', '💝', '🌷', '🌸', '🌺', '☀️', '🏖️', '🌻', '🍂', '🎃', '🍁', '🎄'][month.getMonth()];
  const filteredFamily = filterFamily === 'all' ? null : families.find((f) => f.id === filterFamily);

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
          data-testid="memories-prev-month" style={navBtnStyle}>‹</button>
        <button type="button" onClick={nextMonth} disabled={isCurrentMonth}
          data-testid="memories-next-month"
          style={{ ...navBtnStyle, opacity: isCurrentMonth ? 0.3 : 1 }}>›</button>
      </div>

      {/* Family filter chips — solo se l'utente è in più famiglie */}
      {families.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto',
          paddingBottom: 4, scrollbarWidth: 'none',
        }} data-testid="memories-family-filter">
          <button type="button" onClick={() => setFilterFamily('all')}
            data-testid="memories-family-all"
            style={chipStyle(filterFamily === 'all')}>
            🌍 Tutte
          </button>
          {families.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilterFamily(f.id)}
              data-testid={`memories-family-${f.id}`}
              style={chipStyle(filterFamily === f.id)}>
              {f.emoji} {f.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--km)', padding: 20, textAlign: 'center' }}>
          Caricamento ricordi…
        </div>
      ) : photos.length === 0 ? (
        <div style={{ padding: '20px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>🖼️</div>
          <div style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.5 }}>
            Nessuna foto questo mese{filteredFamily ? ` in "${filteredFamily.name}"` : ''}.<br />
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
            {photos.slice(0, compact ? 8 : 12).map((p) => (
              <button key={p.id} type="button" onClick={() => openPhoto(p)}
                data-testid={`memory-photo-${p.id}`}
                title={`${p.kind === 'task' ? 'Incarico' : 'Evento'}: ${p.title}`}
                style={{
                  aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
                  border: '1px solid var(--sm)', padding: 0, background: 'var(--ab)',
                  cursor: 'pointer', position: 'relative',
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

      {openTask && (
        <TaskDetailModal
          task={openTask}
          members={members}
          me={me}
          onClose={() => setOpenTask(null)}
          onChanged={() => { setOpenTask(null); /* foto refresh dopo */ }}
        />
      )}
      {openEvent && (
        <EventDetailModal
          event={openEvent}
          families={families}
          members={members}
          me={me}
          onClose={() => setOpenEvent(null)}
          onChanged={() => setOpenEvent(null)}
        />
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

function chipStyle(active) {
  return {
    padding: '6px 12px', borderRadius: 100,
    border: '1.5px solid', borderColor: active ? 'var(--k)' : 'var(--sm)',
    background: active ? 'var(--k)' : 'white',
    color: active ? 'white' : 'var(--km)',
    fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
    cursor: 'pointer', flexShrink: 0,
  };
}
