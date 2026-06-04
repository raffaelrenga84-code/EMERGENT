import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

const KEY = 'fammy_quiet_hours';

/**
 * QuietHoursControl — toggle "Non disturbare 22-07" nel Profilo.
 * Stato persistito in localStorage. Lettura da useEventNotifications.inQuietHours().
 */
export default function QuietHoursControl() {
  const { t } = useT();
  const [config, setConfig] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { enabled: false, startHour: 22, endHour: 7 };
    } catch { return { enabled: false, startHour: 22, endHour: 7 }; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(config)); } catch (e) {}
  }, [config]);

  const fmtHour = (h) => `${String(h).padStart(2, '0')}:00`;

  return (
    <div data-testid="quiet-hours-control" style={{
      padding: 14, background: 'var(--ab)', borderRadius: 12,
      border: '1px solid var(--sd)',
    }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer', marginBottom: config.enabled ? 12 : 0,
      }}>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
          data-testid="quiet-hours-toggle"
          style={{ width: 18, height: 18 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--k)' }}>
            {t('quiet_h_title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>
            {config.enabled
              ? t('quiet_h_active_fmt', { from: fmtHour(config.startHour), to: fmtHour(config.endHour) })
              : t('quiet_h_sub')}
          </div>
        </div>
      </label>

      {config.enabled && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <HourPicker
            label={t('quiet_h_from')}
            value={config.startHour}
            onChange={(v) => setConfig((c) => ({ ...c, startHour: v }))}
            testid="quiet-hours-start"
          />
          <span style={{ color: 'var(--km)', fontSize: 14 }}>→</span>
          <HourPicker
            label={t('quiet_h_to')}
            value={config.endHour}
            onChange={(v) => setConfig((c) => ({ ...c, endHour: v }))}
            testid="quiet-hours-end"
          />
        </div>
      )}
    </div>
  );
}

function HourPicker({ label, value, onChange, testid }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', background: 'white', border: '1px solid var(--sm)',
      borderRadius: 10, fontSize: 13, fontWeight: 600,
    }}>
      <span style={{ color: 'var(--km)', fontSize: 11 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testid}
        style={{
          border: 'none', background: 'transparent', fontSize: 14, fontWeight: 700,
          color: 'var(--k)', cursor: 'pointer', outline: 'none',
        }}>
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
        ))}
      </select>
    </label>
  );
}
