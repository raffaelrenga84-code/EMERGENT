import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { aiClient } from '../lib/aiClient.js';
import { useT } from '../lib/i18n.jsx';

/**
 * GiftIdeasModal
 * Opened from a member's birthday section. Calls /api/ai/gift-ideas and
 * renders 3-5 idea cards. Member info is passed in via props.
 */
function ageFromBirthdate(bd) {
  if (!bd) return null;
  try {
    const d = new Date(bd);
    const t = new Date();
    let age = t.getFullYear() - d.getFullYear();
    const m = t.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age--;
    return age >= 0 && age < 130 ? age : null;
  } catch (e) { return null; }
}

export default function GiftIdeasModal({ member, onClose }) {
  const { t, lang } = useT();
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [interests, setInterests] = useState('');
  const [budget, setBudget] = useState({ min: 20, max: 100 });

  const fetchIdeas = async (extraNotes = '') => {
    setLoading(true); setErr('');
    try {
      const res = await aiClient.giftIdeas({
        member_name: member.name,
        member_role: member.role || null,
        age: ageFromBirthdate(member.birthdate),
        interests: extraNotes || null,
        budget_min: budget.min,
        budget_max: budget.max,
        lang,
      });
      setIdeas(res.ideas || []);
    } catch (e) {
      setErr(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIdeas(''); /* re-fetch when language changes */ }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="gift-ideas-modal">
      <div className="modal" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="gift-modal-h">
          <span className="gift-modal-spark"><Sparkles size={22} /></span>
          <h2 style={{ flex: 1 }}>{t('gift_ideas_h').replace('{name}', member.name)}</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="gift-ideas-close"
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: 'var(--sm)', color: 'var(--km)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title={t('close')}
          ><X size={18} /></button>
        </div>
        <p className="modal-sub">{t('gift_ideas_sub')}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: '1 1 220px' }}
            placeholder={t('gift_ideas_interests_ph')}
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            data-testid="gift-ideas-interests"
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <input
              className="input"
              type="number" min={0} max={9999}
              style={{ width: 70, padding: '10px 8px' }}
              value={budget.min}
              onChange={(e) => setBudget((b) => ({ ...b, min: Number(e.target.value) }))}
              data-testid="gift-ideas-budget-min"
            />
            <span style={{ color: 'var(--km)' }}>—</span>
            <input
              className="input"
              type="number" min={0} max={9999}
              style={{ width: 70, padding: '10px 8px' }}
              value={budget.max}
              onChange={(e) => setBudget((b) => ({ ...b, max: Number(e.target.value) }))}
              data-testid="gift-ideas-budget-max"
            />
            <span style={{ color: 'var(--km)', fontSize: 12 }}>€</span>
          </div>
          <button
            type="button"
            className="btn"
            style={{ padding: '10px 16px', fontSize: 13 }}
            disabled={loading}
            onClick={() => fetchIdeas(interests)}
            data-testid="gift-ideas-regen"
          >
            {loading ? <span className="spin" /> : `✨ ${t('regenerate')}`}
          </button>
        </div>

        {loading && ideas.length === 0 && (
          <div className="gift-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="gift-card">
                <div className="skeleton" style={{ height: 22, width: '60%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 14, width: '95%', marginBottom: 4 }} />
                <div className="skeleton" style={{ height: 14, width: '80%' }} />
              </div>
            ))}
          </div>
        )}

        {err && (
          <div className="login-msg error" style={{ marginTop: 8 }}>⚠️ {err}</div>
        )}

        {!loading && ideas.length > 0 && (
          <div className="gift-grid" data-testid="gift-ideas-grid">
            {ideas.map((g, i) => (
              <div key={i} className="gift-card" data-testid={`gift-idea-${i}`}>
                <div className="gift-card-title">{g.title}</div>
                <div className="gift-card-desc">{g.description}</div>
                {g.price_range && <span className="gift-card-price">{g.price_range}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
