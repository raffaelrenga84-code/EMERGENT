import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * FamilySwitcher — pill cliccabile che apre un bottom-sheet per cambiare
 * famiglia attiva. Sostituisce le righe orizzontali di chip "fam-switcher".
 *
 * Props:
 *  - families:      lista famiglie utente
 *  - activeFamily:  'all' | family.id
 *  - isAll:         bool
 *  - onSwitch:      (id|'all') => void
 *  - testidPrefix:  string per data-testid
 *  - variant:       'pill' (default, dentro tab content) | 'title' (titolo H1 cliccabile)
 */
export default function FamilySwitcher({ families = [], activeFamily, isAll, onSwitch, testidPrefix = 'fam-switcher', variant = 'pill' }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const hasMultiple = families.length > 1;

  const current = isAll
    ? { emoji: '🌍', name: t('all_families_chip').replace(/^🌍\s?/, ''), photo_url: null }
    : families.find((f) => f.id === activeFamily) || { emoji: '👥', name: '—', photo_url: null };

  const AvatarIcon = ({ size }) => (
    current.photo_url ? (
      <img
        src={current.photo_url}
        alt=""
        style={{
          width: size, height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1.5px solid var(--sm)',
          flexShrink: 0,
        }} />
    ) : (
      <span style={{ fontSize: size * 0.92, lineHeight: 1 }}>{current.emoji}</span>
    )
  );

  const trigger = variant === 'title' ? (
    <button
      type="button"
      onClick={() => hasMultiple && setOpen(true)}
      data-testid={`${testidPrefix}-trigger`}
      style={{
        background: 'transparent', border: 'none', padding: 0,
        textAlign: 'left', cursor: hasMultiple ? 'pointer' : 'default',
        display: 'inline-flex', alignItems: 'center', gap: 10,
      }}>
      <AvatarIcon size={36} />
      <h1 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0 }}>
        {current.name}
        {hasMultiple && (
          <span style={{ fontSize: 18, color: 'var(--km)', fontWeight: 600 }}>▾</span>
        )}
      </h1>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => hasMultiple && setOpen(true)}
      data-testid={`${testidPrefix}-trigger`}
      style={{
        margin: '10px 16px 6px',
        padding: '10px 14px',
        background: 'white',
        border: '1.5px solid var(--sm)',
        borderRadius: 100,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 14, fontWeight: 700, color: 'var(--k)',
        cursor: hasMultiple ? 'pointer' : 'default',
        boxShadow: '0 2px 6px rgba(28,22,17,0.05)',
      }}>
      <AvatarIcon size={20} />
      <span>{current.name}</span>
      {hasMultiple && (
        <span style={{ fontSize: 14, color: 'var(--km)', marginLeft: 4 }}>▾</span>
      )}
    </button>
  );

  return (
    <>
      {trigger}

      {open && hasMultiple && (
        <div
          data-testid={`${testidPrefix}-sheet-backdrop`}
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1500,
            background: 'rgba(28,22,17,0.35)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid={`${testidPrefix}-sheet`}
            style={{
              width: '100%', maxWidth: 520,
              background: 'white',
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              padding: '14px 18px calc(28px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
              display: 'flex', flexDirection: 'column', gap: 6,
              animation: 'fammy-sheet-up 220ms cubic-bezier(.2,.8,.3,1)',
              maxHeight: '70vh', overflowY: 'auto',
            }}>
            <div style={{
              width: 40, height: 4, borderRadius: 4, background: 'var(--sm)',
              margin: '0 auto 12px',
            }} />
            <div style={{
              fontSize: 11, fontWeight: 800, color: 'var(--km)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              textAlign: 'center', marginBottom: 6,
            }}>{t('switch_family_h') || 'Scegli famiglia'}</div>
            <FamSheetItem
              active={isAll}
              icon="🌍"
              label={t('all_families_chip').replace(/^🌍\s?/, '')}
              hint={`${families.length} ${families.length === 1 ? t('family_one_label') : t('family_other_label')}`}
              onClick={() => { onSwitch('all'); setOpen(false); }}
              testid={`${testidPrefix}-item-all`}
            />
            {families.map((f) => (
              <FamSheetItem key={f.id}
                active={activeFamily === f.id}
                icon={f.emoji}
                photoUrl={f.photo_url}
                label={f.name}
                onClick={() => { onSwitch(f.id); setOpen(false); }}
                testid={`${testidPrefix}-item-${f.id}`}
              />
            ))}
            <button
              onClick={() => setOpen(false)}
              data-testid={`${testidPrefix}-cancel`}
              style={{
                marginTop: 10, padding: '12px', borderRadius: 12,
                border: '1px solid var(--sm)', background: 'white',
                fontSize: 14, fontWeight: 700, color: 'var(--km)', cursor: 'pointer',
              }}>{t('cancel') || 'Annulla'}</button>
          </div>
        </div>
      )}
    </>
  );
}

function FamSheetItem({ active, icon, photoUrl, label, hint, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        borderRadius: 14,
        border: active ? '2px solid var(--ac)' : '1.5px solid var(--sm)',
        background: active ? 'rgba(193, 98, 75, 0.08)' : 'white',
        cursor: 'pointer',
        textAlign: 'left',
      }}>
      {photoUrl ? (
        <img src={photoUrl} alt=""
          style={{
            width: 38, height: 38, borderRadius: '50%',
            objectFit: 'cover', flexShrink: 0,
            border: '1.5px solid var(--sm)',
          }} />
      ) : (
        <span style={{ fontSize: 26 }}>{icon}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--k)' }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>{hint}</div>}
      </div>
      {active && <span style={{ color: 'var(--ac)', fontSize: 18, fontWeight: 700 }}>✓</span>}
    </button>
  );
}
