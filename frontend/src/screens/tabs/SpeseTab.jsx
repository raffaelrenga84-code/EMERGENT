import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import AddExpenseModal from '../../components/AddExpenseModal.jsx';
import FabSpeedDial from '../../components/FabSpeedDial.jsx';
import PartialPaymentModal from '../../components/PartialPaymentModal.jsx';

export default function SpeseTab({ familyId, families = [], expenses, tasks, members, me, onChanged, pendingTask, onClearPendingTask }) {
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [prefillData, setPrefillData] = useState(null); // dati pre-popolati da "ripeti ultima"
  const [shares, setShares] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  // Pagamento parziale: {expense, share, member} oppure null
  const [payingShare, setPayingShare] = useState(null);
  // Idle-pulse: dopo ~1s di inattività il FAB "+" pulsa per attirare attenzione
  const [idlePulse, setIdlePulse] = useState(false);

  useEffect(() => {
    let idleStartTimer = null;
    let pulseOffTimer = null;
    let nextPulseTimer = null;
    const stopAll = () => {
      if (idleStartTimer) clearTimeout(idleStartTimer);
      if (pulseOffTimer) clearTimeout(pulseOffTimer);
      if (nextPulseTimer) clearTimeout(nextPulseTimer);
    };
    const pulseLoop = () => {
      setIdlePulse(true);
      pulseOffTimer = setTimeout(() => {
        setIdlePulse(false);
        nextPulseTimer = setTimeout(pulseLoop, 1400);
      }, 1500);
    };
    const startIdle = () => { idleStartTimer = setTimeout(pulseLoop, 1000); };
    const reset = () => { stopAll(); setIdlePulse(false); startIdle(); };
    startIdle();
    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'scroll', 'keydown', 'wheel'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      stopAll();
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  useEffect(() => {
    if (pendingTask) setShowAdd(true);
  }, [pendingTask]);

  useEffect(() => {
    let cancelled = false;
    if (expenses.length === 0) { setShares([]); return; }
    (async () => {
      const ids = expenses.map((e) => e.id);
      const { data } = await supabase.from('expense_shares').select('*').in('expense_id', ids);
      if (!cancelled) setShares(data || []);
    })();
    return () => { cancelled = true; };
  }, [expenses]);

  // Una spesa è "saldata" quando tutte le quote dei non-pagatori sono settled.
  // Le spese senza shares (vecchio formato, senza split) sono considerate
  // "movimenti attivi" e restano in lista principale.
  const isExpenseSettled = (exp) => {
    const expShares = shares.filter((s) => s.expense_id === exp.id);
    if (expShares.length === 0) return false;
    const debtors = expShares.filter((s) => s.member_id !== exp.paid_by);
    if (debtors.length === 0) return true; // solo il pagatore → tecnicamente saldata
    return debtors.every((s) => s.settled);
  };

  const activeExpenses = expenses.filter((e) => !isExpenseSettled(e));
  const settledExpenses = expenses.filter((e) => isExpenseSettled(e))
    .sort((a, b) => new Date(b.paid_at || b.created_at) - new Date(a.paid_at || a.created_at));

  // Totali "questo mese" sui due bucket per dare contesto
  const inThisMonth = (e) => {
    const d = new Date(e.paid_at || e.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };
  const totalThisMonth = expenses.filter(inThisMonth).reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalOpenThisMonth = activeExpenses.filter(inThisMonth).reduce((s, e) => s + Number(e.amount || 0), 0);

  const balances = computeBalances(expenses, shares, members);

  const removeExpense = async (id) => {
    if (!confirm(t('expenses_delete_confirm'))) return;
    await supabase.from('expenses').delete().eq('id', id);
    onChanged();
  };

  const settleShare = async (expenseId, memberId, settled) => {
    await supabase.from('expense_shares').update({
      settled, settled_at: settled ? new Date().toISOString() : null,
    }).eq('expense_id', expenseId).eq('member_id', memberId);
    const ids = expenses.map((e) => e.id);
    const { data } = await supabase.from('expense_shares').select('*').in('expense_id', ids);
    setShares(data || []);
  };

  const sharesForExpense = (expenseId) => shares.filter((s) => s.expense_id === expenseId);

  // Render della singola card spesa. Estratto in funzione per riusarla sia
  // nella lista "Movimenti" attivi sia dentro "Archivio".
  const renderExpenseCard = (e) => {
    const payer = members.find((m) => m.id === e.paid_by);
    const expShares = sharesForExpense(e.id);
    const settled = isExpenseSettled(e);
    return (
      <div key={e.id} className="card" style={{
        marginBottom: 8,
        opacity: settled ? 0.82 : 1,
        background: settled ? 'var(--gnB)' : 'white',
        border: settled ? '1px solid #B8DAC7' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {settled && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  padding: '2px 7px', borderRadius: 100,
                  background: 'var(--gn)', color: 'white',
                  letterSpacing: '0.04em',
                }} data-testid={`expense-settled-badge-${e.id}`}>
                  ✓ {(t('expenses_settled_label') || 'saldata').toUpperCase()}
                </span>
              )}
              <span>{e.description || t('addexpense_h')}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>
              {payer ? `${t('expenses_paid_by_short')} ${payer.name}` : ''} · {fmtDate(e.paid_at || e.created_at)}
            </div>
          </div>
          <div style={{ fontWeight: 700, fontFamily: 'var(--fs)', fontSize: 16 }}>
            € {Number(e.amount).toFixed(2)}
          </div>
          {(!e.created_by || e.created_by === me?.id) && (
            <button onClick={() => removeExpense(e.id)}
              style={{ background: 'none', border: 'none', color: 'var(--km)', fontSize: 16, padding: 4 }}
              title="Elimina (solo creatore)">✕</button>
          )}
        </div>

        {expShares.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--sm)' }}>
            <div style={{ fontSize: 11, color: 'var(--km)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
              {t('expenses_owed_by')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {expShares.map((s) => {
                const m = members.find((x) => x.id === s.member_id);
                if (!m) return null;
                const isPayer = s.member_id === e.paid_by;
                const paid = Number(s.paid_amount || 0);
                const amt = Number(s.amount || 0);
                const remaining = Math.max(0, amt - paid);
                const isPartiallyPaid = !isPayer && !s.settled && paid > 0;
                const pct = amt > 0 ? Math.min(100, Math.round((paid / amt) * 100)) : 0;
                return (
                  <div key={s.member_id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                    opacity: s.settled ? 0.55 : 1, flexWrap: 'wrap',
                  }}>
                    <Avatar m={m} small />
                    <span style={{ flex: 1, minWidth: 0, textDecoration: s.settled ? 'line-through' : 'none' }}>
                      {m.name} {isPayer && <em style={{ color: 'var(--km)' }}>(ha pagato)</em>}
                    </span>
                    {isPartiallyPaid ? (
                      <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--km)' }}>
                        € {paid.toFixed(2)} / {amt.toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ fontWeight: 600 }}>€ {amt.toFixed(2)}</span>
                    )}
                    {!isPayer && !s.settled && (
                      <button onClick={() => setPayingShare({ expense: e, share: s, member: m })}
                        data-testid={`expense-add-payment-${e.id}-${s.member_id}`}
                        style={{
                          padding: '4px 10px', borderRadius: 100,
                          border: '1px solid var(--ac)',
                          background: 'white', color: 'var(--ac)',
                          fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        }}>
                        💰 {t('payment_add_short') || 'Aggiungi pagamento'}
                      </button>
                    )}
                    {!isPayer && s.settled && (
                      <button onClick={() => settleShare(e.id, s.member_id, false)}
                        style={{
                          padding: '4px 10px', borderRadius: 100, border: '1px solid var(--gn)',
                          background: 'var(--gnB)', color: 'var(--gn)',
                          fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        }}>
                        {t('expenses_share_unsettle')}
                      </button>
                    )}
                    {isPartiallyPaid && (
                      <div style={{
                        flexBasis: '100%', height: 4, borderRadius: 2,
                        background: 'var(--sm)', marginTop: 2, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${pct}%`, height: '100%',
                          background: 'var(--ac)', transition: 'width 0.3s ease',
                        }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ padding: '8px 16px 0' }}>
        <div className="card" style={{ background: 'var(--k)', color: 'white', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
            💸 {t('expenses_open_h') || 'Da saldare'}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--fs)' }}>€ {totalOpenThisMonth.toFixed(2)}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>
            {t('expenses_this_month')}: € {totalThisMonth.toFixed(2)}
            {settledExpenses.length > 0 && (
              <span style={{ marginLeft: 8 }}>· ✅ {settledExpenses.length} {t('expenses_settled_label') || 'saldate'}</span>
            )}
          </div>
        </div>
      </div>

      {balances.length > 0 && (
        <>
          <div className="sh"><span className="sh-l">⚖️ {t('expenses_balances_h')}</span></div>
          <div className="list">
            {balances.map((b, i) => {
              const debtor = members.find((m) => m.id === b.from);
              const creditor = members.find((m) => m.id === b.to);
              if (!debtor || !creditor) return null;
              return (
                <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar m={debtor} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{debtor.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--km)' }}>{t('expenses_balance_owes')}</span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--fs)', color: 'var(--rd)' }}>€ {b.amount.toFixed(2)}</span>
                  <span style={{ fontSize: 12, color: 'var(--km)' }}>{t('expenses_balance_to')}</span>
                  <Avatar m={creditor} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{creditor.name}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {expenses.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">💶</div>
          <h3>{t('expenses_empty_h')}</h3>
          <p>{t('expenses_empty_p')}</p>
        </div>
      ) : (
        <>
          {activeExpenses.length > 0 && (
            <>
              <div className="sh"><span className="sh-l">{t('expenses_movements')}</span><span className="sh-c">{activeExpenses.length}</span></div>
              <div className="list">
                {activeExpenses.map((e) => renderExpenseCard(e))}
              </div>
            </>
          )}

          {activeExpenses.length === 0 && settledExpenses.length > 0 && (
            <div style={{
              padding: '32px 22px 12px', textAlign: 'center',
              color: 'var(--km)',
            }} data-testid="all-settled-banner">
              <div style={{ fontSize: 40, marginBottom: 6 }}>✨</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--k)', marginBottom: 4 }}>
                {t('expenses_all_settled_h') || 'Tutto in pari!'}
              </div>
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.4 }}>
                {t('expenses_all_settled_p') || 'Non ci sono spese da saldare in questo momento. Trova le spese passate nell\'archivio qui sotto.'}
              </p>
            </div>
          )}

          {settledExpenses.length > 0 && (
            <SettledArchive
              expenses={settledExpenses}
              members={members}
              shares={shares}
              me={me}
              open={showArchive}
              onToggle={() => setShowArchive((v) => !v)}
              renderExpenseCard={renderExpenseCard}
              t={t}
            />
          )}
        </>
      )}

      <FabSpeedDial
        testid="spese-fab"
        pulse={idlePulse}
        actions={[
          {
            id: 'expense',
            icon: '💶',
            label: t('fab_new_expense') || 'Nuova spesa',
            onClick: () => { setPrefillData(null); setShowAdd(true); },
            testid: 'spese-fab-new-expense',
          },
          ...(expenses.length > 0 ? [{
            id: 'repeat',
            icon: '🔁',
            label: t('fab_repeat_last') || 'Ripeti ultima spesa',
            onClick: () => {
              // Trova l'ultima spesa creata (DESC by created_at) e pre-popola
              const last = [...expenses].sort((a, b) =>
                new Date(b.created_at || b.paid_at || 0) - new Date(a.created_at || a.paid_at || 0)
              )[0];
              if (!last) return;
              setPrefillData({
                amount: last.amount,
                description: last.description,
                category: last.category,
                family_id: last.family_id,
                paid_by: last.paid_by,
                task_id: null, // non riproduco il collegamento al task
              });
              setShowAdd(true);
            },
            testid: 'spese-fab-repeat-last',
          }] : []),
        ]}
      />

      {showAdd && (
        <AddExpenseModal
          familyId={pendingTask?.family_id || prefillData?.family_id || familyId}
          families={families}
          members={members}
          defaultPaidBy={prefillData?.paid_by || me?.id}
          authorMemberId={me?.id}
          prefilledTask={pendingTask}
          prefilledExpense={prefillData}
          onClose={() => { setShowAdd(false); setPrefillData(null); onClearPendingTask && onClearPendingTask(); }}
          onCreated={() => { setShowAdd(false); setPrefillData(null); onClearPendingTask && onClearPendingTask(); onChanged(); }}
        />
      )}

      {payingShare && (
        <PartialPaymentModal
          expense={payingShare.expense}
          share={payingShare.share}
          member={payingShare.member}
          meId={me?.id}
          onClose={() => setPayingShare(null)}
          onSaved={() => { setPayingShare(null); onChanged(); }}
        />
      )}
    </>
  );
}

function computeBalances(expenses, shares, members) {
  const map = {};
  for (const exp of expenses) {
    const expShares = shares.filter((s) => s.expense_id === exp.id && !s.settled);
    for (const s of expShares) {
      if (s.member_id === exp.paid_by) continue;
      if (!map[s.member_id]) map[s.member_id] = {};
      if (!map[s.member_id][exp.paid_by]) map[s.member_id][exp.paid_by] = 0;
      map[s.member_id][exp.paid_by] += Number(s.amount);
    }
  }
  const list = [];
  Object.keys(map).forEach((from) => {
    Object.keys(map[from]).forEach((to) => {
      const amount = map[from][to];
      const reverse = map[to]?.[from] || 0;
      const net = amount - reverse;
      if (net > 0.01) list.push({ from, to, amount: net });
    });
  });
  return list.sort((a, b) => b.amount - a.amount);
}

function Avatar({ m, small }) {
  if (!m) return null;
  const size = small ? 20 : 28;
  return (
    <span style={{
      width: size, height: size, borderRadius: small ? 6 : 9,
      background: m.avatar_color || '#1C1611', color: 'white',
      fontSize: small ? 10 : 12, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{m.avatar_letter || m.name.charAt(0).toUpperCase()}</span>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * SettledArchive — sezione collassabile in fondo a SpeseTab che raggruppa
 * tutte le spese saldate. Default chiusa (utente già "ha gestito" quelle spese).
 * All'apertura mostra il totale archiviato + lista delle card spesa.
 */
function SettledArchive({ expenses, members, shares, me, open, onToggle, renderExpenseCard, t }) {
  const totalArchive = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  return (
    <div style={{ marginTop: 20, marginBottom: 4 }} data-testid="expenses-archive-section">
      <button
        type="button"
        onClick={onToggle}
        data-testid="expenses-archive-toggle"
        className="collapsible-header"
        style={{
          borderLeft: '4px solid var(--gn)',
          paddingLeft: 16,
          background: open ? 'var(--gnB)' : 'transparent',
        }}>
        <span className="collapsible-arrow" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
        <span className="collapsible-label" style={{ fontWeight: 600, fontSize: 14, color: 'var(--gn)' }}>
          ✅ {t('expenses_archive_h') || 'Archivio · Saldate'}
        </span>
        <span className="collapsible-count" style={{
          fontWeight: 700, fontSize: 12,
          background: 'var(--gn)', color: 'white',
        }}>{expenses.length}</span>
      </button>
      {open && (
        <>
          <div style={{
            padding: '8px 22px 4px', fontSize: 12, color: 'var(--km)',
            display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}>
            <span>{t('expenses_archive_hint') || 'Spese chiuse: nessuno deve più nulla.'}</span>
            <span style={{ fontWeight: 700, color: 'var(--gn)' }}>
              {t('expenses_archive_total') || 'Totale archiviato'}: € {totalArchive.toFixed(2)}
            </span>
          </div>
          <div className="list">
            {expenses.map((e) => renderExpenseCard(e))}
          </div>
        </>
      )}
    </div>
  );
}
