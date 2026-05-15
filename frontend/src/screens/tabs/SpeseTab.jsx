import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import AddExpenseModal from '../../components/AddExpenseModal.jsx';

export default function SpeseTab({ familyId, families = [], expenses, tasks, members, me, onChanged, pendingTask, onClearPendingTask }) {
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [shares, setShares] = useState([]);

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

  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalThisMonth = expenses
    .filter((e) => {
      const d = new Date(e.paid_at || e.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, e) => s + Number(e.amount || 0), 0);

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

  return (
    <>
      <div style={{ padding: '8px 16px 0' }}>
        <div className="card" style={{ background: 'var(--k)', color: 'white', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>{t('expenses_total')}</div>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--fs)' }}>€ {total.toFixed(2)}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>
            {t('expenses_this_month')}: € {totalThisMonth.toFixed(2)}
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
          <div className="sh"><span className="sh-l">{t('expenses_movements')}</span><span className="sh-c">{expenses.length}</span></div>
          <div className="list">
            {expenses.map((e) => {
              const payer = members.find((m) => m.id === e.paid_by);
              const expShares = sharesForExpense(e.id);
              return (
                <div key={e.id} className="card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{e.description || t('addexpense_h')}</div>
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
                          return (
                            <div key={s.member_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, opacity: s.settled ? 0.5 : 1 }}>
                              <Avatar m={m} small />
                              <span style={{ flex: 1, textDecoration: s.settled ? 'line-through' : 'none' }}>
                                {m.name} {isPayer && <em style={{ color: 'var(--km)' }}>(ha pagato)</em>}
                              </span>
                              <span style={{ fontWeight: 600 }}>€ {Number(s.amount).toFixed(2)}</span>
                              {!isPayer && (
                                <button onClick={() => settleShare(e.id, s.member_id, !s.settled)}
                                  style={{
                                    padding: '4px 10px', borderRadius: 100, border: '1px solid',
                                    borderColor: s.settled ? 'var(--gn)' : 'var(--sm)',
                                    background: s.settled ? 'var(--gnB)' : 'white',
                                    color: s.settled ? 'var(--gn)' : 'var(--km)',
                                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                                  }}>
                                  {s.settled ? t('expenses_share_unsettle') : t('expenses_share_settle')}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <button className="fab" onClick={() => setShowAdd(true)}>+</button>

      {showAdd && (
        <AddExpenseModal
          familyId={pendingTask?.family_id || familyId}
          families={families}
          members={members}
          defaultPaidBy={me?.id}
          authorMemberId={me?.id}
          prefilledTask={pendingTask}
          onClose={() => { setShowAdd(false); onClearPendingTask && onClearPendingTask(); }}
          onCreated={() => { setShowAdd(false); onClearPendingTask && onClearPendingTask(); onChanged(); }}
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
