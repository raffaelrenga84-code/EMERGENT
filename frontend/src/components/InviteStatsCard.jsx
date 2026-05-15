import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * InviteStatsCard — mostra "Hai invitato X persone questa settimana" basandosi
 * sui membri (status active, user_id non null) aggiunti negli ultimi 7 giorni
 * alle famiglie di cui l'utente è `created_by`.
 *
 * Niente schema change: conta members.created_at >= 7d ago AND
 * family.created_by = me.user_id AND member.user_id != me.user_id.
 *
 * Non si mostra se l'utente non possiede famiglie (created_by != me).
 */
export default function InviteStatsCard({ session, families = [] }) {
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const myUserId = session?.user?.id;
  // Solo le famiglie di cui sono owner
  const ownedFamilyIds = families.filter((f) => f.created_by === myUserId).map((f) => f.id);

  useEffect(() => {
    let cancelled = false;
    if (!myUserId || ownedFamilyIds.length === 0) {
      setLoading(false); setCount(0);
      return;
    }
    (async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: c, error } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .in('family_id', ownedFamilyIds)
        .neq('user_id', myUserId)
        .not('user_id', 'is', null)
        .gte('created_at', sevenDaysAgo.toISOString());
      if (cancelled) return;
      if (error) {
        setCount(0);
      } else {
        setCount(c || 0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUserId, ownedFamilyIds.join(',')]);

  // Se non sono owner di nessuna famiglia, non mostriamo nulla (non avrebbe
  // senso "Hai invitato 0 persone" se non hai ancora una famiglia da gestire).
  if (ownedFamilyIds.length === 0) return null;
  if (loading) return null;

  const tone = pickTone(count);

  return (
    <div
      data-testid="invite-stats-card"
      style={{
        margin: '4px 0 14px',
        padding: '16px 18px',
        background: `linear-gradient(135deg, ${tone.bg} 0%, white 100%)`,
        border: `1px solid ${tone.border}`,
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 2px 8px rgba(28,22,17,.04)',
      }}>
      <div style={{
        width: 48, height: 48, flexShrink: 0,
        borderRadius: 14, background: tone.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24,
      }}>
        {tone.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: tone.accent,
          textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 2,
        }}>
          Questa settimana
        </div>
        <div style={{
          fontFamily: 'var(--fs)', fontSize: 17, fontWeight: 500,
          letterSpacing: '-0.005em', color: 'var(--k)', lineHeight: 1.25,
        }}>
          {tone.message(count)}
        </div>
      </div>
    </div>
  );
}

function pickTone(count) {
  if (count === 0) {
    return {
      emoji: '🌱',
      bg: 'var(--ab)', border: 'var(--sm)', iconBg: 'var(--sm)',
      accent: 'var(--km)',
      message: () => 'Pronto a far crescere la famiglia? Condividi il codice invito 💌',
    };
  }
  if (count <= 3) {
    return {
      emoji: '🌿',
      bg: '#F4F6F2', border: '#DDE5D7', iconBg: '#DDE5D7',
      accent: '#587A4E',
      message: (n) => `Hai invitato ${n} ${n === 1 ? 'persona' : 'persone'}. Bel inizio! 🌿`,
    };
  }
  if (count <= 9) {
    return {
      emoji: '🎉',
      bg: '#FFF5EE', border: '#F5C9AC', iconBg: '#F5C9AC',
      accent: '#C1624B',
      message: (n) => `Hai invitato ${n} persone! La famiglia sta crescendo 🎉`,
    };
  }
  return {
    emoji: '🚀',
    bg: '#FFF1E6', border: '#FFD6A5', iconBg: '#FFD6A5',
    accent: '#B5563D',
    message: (n) => `Wow, ${n} nuovi membri! Sei un connettore nato 🚀`,
  };
}
