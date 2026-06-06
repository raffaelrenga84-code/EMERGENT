import { useMemo, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

/**
 * Saldo cumulativo "chi deve cosa a chi" — stile Splitwise.
 *
 * Calcola dal lato client. Per ogni spesa NON saldata:
 *   - paid_by   = chi ha messo i soldi
 *   - shares    = array di { member_id, amount, settled }
 *
 * Per ogni debtor (shares.settled=false, member_id != paid_by) accumula:
 *   net[debtor][creditor] += amount
 *
 * Poi semplifica i debiti reciproci (A deve 10 a B + B deve 4 a A → A deve 6 a B).
 *
 * UI:
 *  - 0 debiti aperti → card verde "Tutto saldato"
 *  - N debiti → lista compatta "{debtor} → {creditor} : €{amount}"
 *  - Tap su una riga → suggerisce "Segna saldato" (best-effort, opzionale)
 *
 * Props:
 *  expenses: array of expense rows
 *  shares:   array of expense_shares rows
 *  members:  array of member rows
 *  me:       member corrente (per evidenziare le righe che mi riguardano)
 */
export default function ExpensesBalance({ expenses = [], shares = [], members = [], me }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  // Mappa member.id → display name
  const nameById = useMemo(() => {
    const map = new Map();
    for (const m of members) map.set(m.id, m.name || '?');
    return map;
  }, [members]);

  // Calcolo netto: chi deve cosa a chi, con compensazione reciproca
  const debts = useMemo(() => {
    // map: `${debtor}->${creditor}` → amount
    const acc = new Map();

    for (const exp of expenses) {
      if (!exp.paid_by) continue;
      const expShares = shares.filter((s) => s.expense_id === exp.id);
      if (expShares.length === 0) continue;

      // Skip se questa spesa è completamente settled
      const debtorsAll = expShares.filter((s) => s.member_id !== exp.paid_by);
      if (debtorsAll.length === 0) continue;
      const allSettled = debtorsAll.every((s) => s.settled);
      if (allSettled) continue;

      // Per ogni quota non saldata dei non-pagatori → aggiungi al netto
      for (const s of debtorsAll) {
        if (s.settled) continue;
        const amount = Number(s.amount || 0);
        if (amount <= 0) continue;
        const key = `${s.member_id}->${exp.paid_by}`;
        acc.set(key, (acc.get(key) || 0) + amount);
      }
    }

    // Compensa debiti reciproci: A→B = 10, B→A = 4 → A→B = 6
    const seen = new Set();
    const result = [];
    for (const [key, amount] of acc.entries()) {
      if (seen.has(key)) continue;
      const [debtor, creditor] = key.split('->');
      const reverseKey = `${creditor}->${debtor}`;
      const reverseAmount = acc.get(reverseKey) || 0;
      seen.add(key);
      seen.add(reverseKey);
      const net = amount - reverseAmount;
      if (Math.abs(net) < 0.01) continue;
      if (net > 0) {
        result.push({ debtor, creditor, amount: net });
      } else {
        result.push({ debtor: creditor, creditor: debtor, amount: -net });
      }
    }

    // Ordina: prima i debiti che mi coinvolgono, poi per importo decrescente
    return result.sort((a, b) => {
      const aMine = (me?.id === a.debtor || me?.id === a.creditor) ? 0 : 1;
      const bMine = (me?.id === b.debtor || me?.id === b.creditor) ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return b.amount - a.amount;
    });
  }, [expenses, shares, me?.id]);

  if (debts.length === 0) {
    // Stato "tutto saldato": card minimalista verde
    return (
      <div data-testid="expenses-balance-empty" style={{
        padding: '12px 14px', marginBottom: 12,
        background: 'var(--gnB)', border: '1px solid var(--gn)',
        borderRadius: 12, color: 'var(--gn)',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 13, fontWeight: 600,
      }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <span>{t('balance_all_settled') || 'Tutto saldato! Nessuno deve nulla.'}</span>
      </div>
    );
  }

  const visible = expanded ? debts : debts.slice(0, 3);
  const hidden = debts.length - visible.length;

  return (
    <div data-testid="expenses-balance" style={{
      padding: 12, marginBottom: 12,
      background: 'white', border: '1px solid var(--sm)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--k)' }}>
          📊 {t('balance_h') || 'Saldo aperto'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--km)', fontWeight: 600 }}>
          {debts.length === 1
            ? (t('balance_one') || '1 debito aperto')
            : (t('balance_many', { n: debts.length }) || `${debts.length} debiti aperti`)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((d, i) => {
          const debtorName = nameById.get(d.debtor) || '—';
          const creditorName = nameById.get(d.creditor) || '—';
          const mine = me?.id === d.debtor || me?.id === d.creditor;
          const iAmDebtor = me?.id === d.debtor;
          return (
            <div key={`${d.debtor}->${d.creditor}-${i}`}
              data-testid={`balance-row-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 10,
                background: mine ? '#FFF6E5' : 'var(--ab)',
                border: mine ? '1px solid #F39C12' : '1px solid transparent',
              }}>
              <span style={{ fontSize: 16 }}>{iAmDebtor ? '⚠️' : (mine ? '💰' : '↔️')}</span>
              <div style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                <span style={{ fontWeight: 700, color: 'var(--k)' }}>
                  {iAmDebtor ? (t('balance_you') || 'Tu') : debtorName}
                </span>
                <span style={{ color: 'var(--km)', margin: '0 4px' }}>→</span>
                <span style={{ fontWeight: 700, color: 'var(--k)' }}>
                  {me?.id === d.creditor ? (t('balance_you') || 'Tu') : creditorName}
                </span>
              </div>
              <span style={{
                fontSize: 14, fontWeight: 800,
                color: iAmDebtor ? 'var(--rd)' : (me?.id === d.creditor ? 'var(--gn)' : 'var(--k)'),
                whiteSpace: 'nowrap',
              }}>
                €{d.amount.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded(true)}
          data-testid="balance-show-all"
          style={{
            marginTop: 8, padding: '6px 10px', borderRadius: 100,
            border: '1px solid var(--sm)', background: 'transparent',
            fontSize: 11, color: 'var(--km)', fontWeight: 600, cursor: 'pointer',
          }}>
          + {t('balance_show_n_more', { n: hidden }) || `Mostra altri ${hidden}`}
        </button>
      )}
    </div>
  );
}
