import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * PartialPaymentModal — registra un pagamento parziale o totale su una
 * quota spesa. L'utente inserisce l'importo versato (con shortcut "Salda
 * tutto"). Il trigger DB ricalcola automaticamente paid_amount + settled
 * sulla share.
 *
 * Props:
 *  - expense:   l'oggetto expense (per descrizione/totale nel titolo)
 *  - share:     la quota corrente { expense_id, member_id, amount, paid_amount }
 *  - member:    il debitore (per nome nel titolo)
 *  - meId:      member id dell'utente corrente (per created_by)
 *  - onClose:   chiusura senza salvare
 *  - onSaved:   callback dopo INSERT riuscito
 */
export default function PartialPaymentModal({ expense, share, member, meId, onClose, onSaved }) {
  const { t } = useT();
  const remaining = Math.max(0, Number(share.amount) - Number(share.paid_amount || 0));
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const numAmount = Number(amount) || 0;
  const willClose = numAmount + 0.01 >= remaining;

  const save = async () => {
    setErr('');
    if (numAmount <= 0) {
      setErr(t('payment_err_positive') || 'Inserisci un importo maggiore di 0');
      return;
    }
    if (numAmount > remaining + 0.01) {
      setErr(t('payment_err_over') || 'L\'importo supera quanto rimane da saldare');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('expense_payments').insert({
      expense_id: share.expense_id,
      member_id:  share.member_id,
      amount:     numAmount,
      note:       note.trim() || null,
      created_by: meId || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message || 'Errore');
      return;
    }
    onSaved && onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="partial-payment-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>💸</span>
          <h2 style={{ flex: 1, margin: 0 }}>
            {t('payment_modal_h') || 'Registra pagamento'}
          </h2>
          <button onClick={onClose} aria-label="close"
            style={{
              width: 34, height: 34, borderRadius: 10,
              border: '1px solid var(--sm)', background: 'white',
              fontSize: 14, cursor: 'pointer',
            }}>✕</button>
        </div>
        <p className="modal-sub" style={{ marginTop: 0, marginBottom: 14 }}>
          <strong>{member?.name || '—'}</strong>
          {' '}
          <span style={{ color: 'var(--km)' }}>
            · {expense?.description || t('addexpense_h')}
          </span>
        </p>

        {/* Riepilogo: quota totale + già pagato + rimanente */}
        <div style={{
          padding: 14, borderRadius: 12, background: 'var(--ab)',
          border: '1px solid var(--sm)', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: 'var(--km)' }}>{t('payment_share_total') || 'Quota totale'}</span>
            <span style={{ fontWeight: 700 }}>€ {Number(share.amount).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: 'var(--km)' }}>{t('payment_share_paid') || 'Già pagato'}</span>
            <span style={{ fontWeight: 700, color: 'var(--gn)' }}>€ {Number(share.paid_amount || 0).toFixed(2)}</span>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 14,
            paddingTop: 8, marginTop: 8, borderTop: '1px solid var(--sm)',
          }}>
            <span style={{ fontWeight: 700 }}>{t('payment_share_remaining') || 'Rimangono da saldare'}</span>
            <span style={{ fontWeight: 800, color: 'var(--ac)' }}>€ {remaining.toFixed(2)}</span>
          </div>
        </div>

        <label className="label">{t('payment_amount') || 'Importo versato (€)'}</label>
        <input
          className="input"
          data-testid="payment-amount-input"
          type="number" step="0.01" inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        {/* Shortcut: salda tutto */}
        {remaining > 0 && numAmount !== remaining && (
          <button
            type="button"
            data-testid="payment-fill-all"
            onClick={() => setAmount(remaining.toFixed(2))}
            style={{
              marginTop: 6, padding: '6px 12px',
              borderRadius: 100, border: '1.5px solid var(--ac)',
              background: 'white', color: 'var(--ac)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
            ⚡ {t('payment_fill_all') || 'Salda tutto'} (€ {remaining.toFixed(2)})
          </button>
        )}

        <label className="label" style={{ marginTop: 14 }}>
          {t('payment_note_opt') || 'Nota (opzionale)'}
        </label>
        <input
          className="input"
          data-testid="payment-note-input"
          placeholder={t('payment_note_ph') || 'Es. bonifico, contanti…'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {willClose && numAmount > 0 && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: 'var(--gnB)', color: 'var(--gn)',
            fontSize: 12, fontWeight: 600,
          }}>
            ✅ {t('payment_will_close') || 'Con questo pagamento la quota sarà completamente saldata'}
          </div>
        )}

        {err && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: '#FDECEC', color: '#A93B2B',
            fontSize: 12, fontWeight: 600,
          }} data-testid="payment-error">{err}</div>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            {t('cancel') || 'Annulla'}
          </button>
          <button
            className="btn"
            data-testid="payment-save-btn"
            onClick={save}
            disabled={busy || numAmount <= 0}>
            {busy ? '…' : (t('payment_save') || 'Registra pagamento')}
          </button>
        </div>
      </div>
    </div>
  );
}
