import { useState } from 'react';
import { useT } from '../../lib/i18n.jsx';

export default function PricingScreen({ onBack }) {
  const { t } = useT();
  const [billing, setBilling] = useState('yearly'); // 'monthly' | 'yearly'

  const monthlyPrice = '5,99€';
  const yearlyPrice = '47,99€';
  const yearlyAsMonthly = '4€';

  const features = [
    { id: 'fams',     free: '1 famiglia',                    pro: 'Famiglie illimitate' },
    { id: 'members',  free: 'Fino a 5 membri',               pro: 'Membri illimitati' },
    { id: 'tasks',    free: 'Task / eventi / spese',         pro: 'Task / eventi / spese' },
    { id: 'invites',  free: '3 inviti via link',             pro: 'Inviti illimitati' },
    { id: 'lang',     free: 'Italiano + Inglese',            pro: '4 lingue (IT/EN/FR/DE)' },
    { id: 'ical',     free: 'Export calendario base',        pro: 'Export con notifiche personalizzate' },
    { id: 'multi',    free: '—',                             pro: 'Multi-assegnatari per task' },
    { id: 'private',  free: '—',                             pro: 'Task privati (visibilità coppia)' },
    { id: 'recurring',free: '—',                             pro: 'Task ricorrenti (settimanale, mensile)' },
    { id: 'attach',   free: '—',                             pro: 'Allegati (foto, documenti)' },
    { id: 'photos',   free: 'Avatar lettera',                pro: 'Foto profilo + avatar custom' },
    { id: 'theme',    free: 'Tema chiaro',                   pro: 'Tema scuro + temi colorati' },
    { id: 'export',   free: '—',                             pro: 'Esportazione dati (Excel, PDF)' },
    { id: 'stats',    free: '—',                             pro: 'Statistiche famiglia (chi fa di più, ecc.)' },
    { id: 'backup',   free: '—',                             pro: 'Backup automatico settimanale' },
    { id: 'support',  free: 'Community',                     pro: 'Supporto prioritario via email' },
  ];

  return (
    <div className="profile-wrap" style={{ paddingBottom: 100 }}>
      <button className="link-btn" onClick={onBack} style={{ marginBottom: 12 }}>{t('profile_back')}</button>
      <h1 className="profile-h">{t('plans_h')}</h1>
      <p style={{ color: 'var(--km)', textAlign: 'center', marginTop: -16, marginBottom: 24 }}>
        {t('plans_sub')}
      </p>

      {/* Toggle billing */}
      <div className="billing-toggle">
        <button className={billing === 'monthly' ? 'on' : ''} onClick={() => setBilling('monthly')}>
          {t('plans_billing_monthly')}
        </button>
        <button className={billing === 'yearly' ? 'on' : ''} onClick={() => setBilling('yearly')}>
          {t('plans_billing_yearly')} <span className="billing-save">{t('plans_billing_save')}</span>
        </button>
      </div>

      {/* Cards */}
      <div className="plan-cards">
        <PlanCard
          title={t('plans_free_t')}
          desc={t('plans_free_d')}
          price={t('plans_free_price')}
          per={t('plans_free_per')}
          ctaLabel={t('plans_free_btn')}
          ctaDisabled
          highlighted={false}
          features={features.map((f) => ({ label: f.free, included: f.free !== '—' }))}
        />
        <PlanCard
          title={t('plans_pro_t')}
          desc={t('plans_pro_d')}
          price={billing === 'yearly' ? yearlyAsMonthly : monthlyPrice}
          per={billing === 'yearly' ? `${t('plans_pro_per_month')} (${yearlyPrice} ${t('plans_pro_per_year')})` : t('plans_pro_per_month')}
          ctaLabel={t('plans_pro_btn')}
          ctaNote={t('plans_pro_trial_note')}
          highlighted
          crown
          features={features.filter((f) => f.pro !== '—').map((f) => ({ label: f.pro, included: true }))}
        />
      </div>

      {/* Tabella confronto */}
      <h2 style={{ fontFamily: 'var(--fs)', fontSize: 20, fontWeight: 600, margin: '32px 0 12px' }}>
        {t('plans_compare_h')}
      </h2>
      <div className="plan-compare">
        <div className="plan-compare-h">
          <div></div>
          <div>{t('plans_free_t')}</div>
          <div>{t('plans_pro_t')} 👑</div>
        </div>
        {features.map((f) => (
          <div key={f.id} className="plan-compare-row">
            <div className="plan-compare-feature">{f.pro.split('(')[0].trim().split(' ').slice(0, 4).join(' ')}</div>
            <div className={f.free === '—' ? 'plan-compare-no' : 'plan-compare-yes'}>{f.free === '—' ? '✕' : '✓'}</div>
            <div className="plan-compare-yes">✓</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanCard({ title, desc, price, per, ctaLabel, ctaNote, ctaDisabled, highlighted, crown, features }) {
  return (
    <div className={`plan-card ${highlighted ? 'highlighted' : ''}`}>
      {crown && <div className="plan-crown">👑</div>}
      <div className="plan-title">{title}</div>
      <div className="plan-desc">{desc}</div>
      <div className="plan-price">{price}</div>
      <div className="plan-per">{per}</div>
      <button className={`btn full ${highlighted ? '' : 'secondary'}`} disabled={ctaDisabled} style={{ marginTop: 16 }}>
        {ctaLabel}
      </button>
      {ctaNote && <p className="plan-cta-note">{ctaNote}</p>}
      <ul className="plan-features">
        {features.map((f, i) => (
          <li key={i}>
            <span style={{ color: 'var(--gn)', marginRight: 8 }}>✓</span>
            {f.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
