import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

export default function AddExpenseModal({ familyId, families = [], members, defaultPaidBy, authorMemberId, prefilledTask = null, onClose, onCreated }) {
  const { t } = useT();
  const [selectedFamily, setSelectedFamily] = useState(prefilledTask?.family_id || familyId || (families.length > 0 ? families[0].id : ''));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState(prefilledTask ? `Pagamento: ${prefilledTask.title}` : '');
  const [paidBy, setPaidBy] = useState(defaultPaidBy || members[0]?.id || '');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [splitMode, setSplitMode] = useState('equal'); // 'equal' | 'custom'
  const [splitMembers, setSplitMembers] = useState([]); // member.id array
  const [customAmounts, setCustomAmounts] = useState({}); // {member_id: number}
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [expandedFamilies, setExpandedFamilies] = useState({}); // {familyId: boolean}
  const [attachments, setAttachments] = useState([]); // {file, preview, name}

  // Filtra members della famiglia selezionata
  const familyMembers = members.filter((m) => m.family_id === selectedFamily);

  // Membri raggruppati per famiglia
  // In vista "Tutte" (familyId=null): mostra tutte le famiglie
  // Altrimenti: mostra solo la famiglia selezionata
  const byFamily = !familyId ? families.map((f) => ({
    family: f,
    members: members.filter((m) => m.family_id === f.id),
  })) : selectedFamily ? [{
    family: families.find((f) => f.id === selectedFamily),
    members: familyMembers,
  }] : [];

  const toggleExpandFamily = (familyId) => {
    setExpandedFamilies((prev) => ({
      ...prev,
      [familyId]: !prev[familyId],
    }));
  };

  const totalAmount = parseFloat((amount || '0').replace(',', '.')) || 0;

  const equalShare = useMemo(() => {
    if (splitMembers.length === 0) return 0;
    return Math.round((totalAmount / splitMembers.length) * 100) / 100;
  }, [totalAmount, splitMembers]);

  const customTotal = useMemo(() => {
    return splitMembers.reduce((s, mid) => s + (parseFloat(customAmounts[mid]) || 0), 0);
  }, [splitMembers, customAmounts]);

  const toggleSplitMember = (id) => {
    setSplitMembers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleAllMembers = (members) => {
    const ids = members.map((m) => m.id);
    const allSelected = ids.every((id) => splitMembers.includes(id));
    if (allSelected) {
      setSplitMembers((prev) => prev.filter((x) => !ids.includes(x)));
    } else {
      setSplitMembers((prev) => [...new Set([...prev, ...ids])]);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setAttachments((prev) => [...prev, {
          file,
          preview: evt.target.result,
          name: file.name,
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!totalAmount || totalAmount <= 0) return;
    if (!selectedFamily) return;
    setBusy(true); setErr('');

    const { data: expense, error: e1 } = await supabase.from('expenses').insert({
      family_id: selectedFamily,
      task_id: prefilledTask?.id || null,
      amount: totalAmount,
      currency: 'EUR',
      description: description.trim() || null,
      paid_by: paidBy || null,
      paid_at: paidAt || null,
      created_by: authorMemberId || null,
    }).select().single();

    if (e1) { setErr(e1.message); setBusy(false); return; }

    // Inserisci le quote
    if (splitMembers.length > 0) {
      const shares = splitMembers.map((mid) => ({
        expense_id: expense.id,
        member_id: mid,
        amount: splitMode === 'equal'
          ? equalShare
          : (parseFloat(customAmounts[mid]) || 0),
        // Se la quota è di chi ha pagato, è già "settled" automaticamente
        settled: mid === paidBy,
        settled_at: mid === paidBy ? new Date().toISOString() : null,
      }));
      const { error: e2 } = await supabase.from('expense_shares').insert(shares);
      if (e2) { setErr(e2.message); setBusy(false); return; }
    }

    // Upload allegati
    if (attachments.length > 0) {
      for (const att of attachments) {
        const timestamp = Date.now();
        const fileName = `${timestamp}-${att.file.name}`;
        const filePath = `expenses/${expense.id}/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('expense-attachments')
          .upload(filePath, att.file);

        if (!uploadErr) {
          try {
            await supabase.from('expense_attachments').insert({
              expense_id: expense.id,
              file_path: filePath,
              file_name: att.file.name,
            });
          } catch (dbErr) {
            console.warn('expense_attachments table not yet created:', dbErr);
          }
        }
      }
    }

    onCreated && onCreated();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('addexpense_h')}</h2>
        <p className="modal-sub">{t('addexpense_sub')}</p>

        {prefilledTask && (
          <div style={{
            marginBottom: 16, padding: 10, background: 'var(--ab)',
            border: '1.5px solid var(--ac)', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13,
          }}>
            <span style={{ fontSize: 18 }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac)', textTransform: 'uppercase' }}>
                {t('expense_for_task')}
              </div>
              <div style={{ fontWeight: 600 }}>{prefilledTask.title}</div>
            </div>
          </div>
        )}

        <form onSubmit={submit}>
          {/* Dropdown famiglia solo se in single-family view */}
          {familyId && families.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="family">{t('addexpense_family') || 'Famiglia'}</label>
              <select id="family" className="input"
                value={selectedFamily} onChange={(e) => setSelectedFamily(e.target.value)}>
                {families.map((f) => <option key={f.id} value={f.id}>{f.emoji} {f.name}</option>)}
              </select>
            </div>
          )}
          <label htmlFor="amount">{t('addexpense_amount')}</label>
          <input id="amount" className="input" autoFocus inputMode="decimal"
            placeholder="0,00"
            value={amount} onChange={(e) => setAmount(e.target.value)} />

          <div style={{ marginTop: 16 }}>
            <label htmlFor="desc">{t('addexpense_desc')}</label>
            <input id="desc" className="input"
              placeholder={t('addexpense_desc_ph')}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="who">{t('addexpense_paid_by')}</label>
            <select id="who" className="input"
              value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {familyMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="when">{t('addexpense_when')}</label>
            <input id="when" type="date" className="input"
              value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>

          {/* Split section */}
          <div style={{ marginTop: 20, padding: 14, background: 'var(--ab)', borderRadius: 14, border: '1px solid var(--sm)' }}>
            <label style={{ marginBottom: 4 }}>{t('expenses_split_label')}</label>
            <div style={{ fontSize: 11, color: 'var(--km)', marginBottom: 12, lineHeight: 1.4 }}>
              {splitMembers.length === 0
                ? t('split_hint_empty')
                : t('expenses_split_hint')}
            </div>

            {/* Modalità split */}
            {splitMembers.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button type="button" onClick={() => setSplitMode('equal')}
                  style={chip(splitMode === 'equal')}>{t('expenses_split_mode_equal')}</button>
                <button type="button" onClick={() => setSplitMode('custom')}
                  style={chip(splitMode === 'custom')}>{t('expenses_split_mode_custom')}</button>
              </div>
            )}

            {/* Selezione membri - TENDINA PER FAMIGLIA */}
            {byFamily.length > 0 && byFamily.map((g) => {
              const isExpanded = expandedFamilies[g.family.id] || false;
              const selectedCount = g.members.filter((m) => splitMembers.includes(m.id)).length;
              const allSelected = g.members.length > 0 && g.members.every((m) => splitMembers.includes(m.id));

              return (
                <div key={g.family.id} style={{ marginBottom: 8, border: '1px solid var(--sm)', borderRadius: 12, overflow: 'hidden', background: 'white' }}>
                  {/* Header tendina */}
                  <button type="button"
                    onClick={() => toggleExpandFamily(g.family.id)}
                    style={{
                      width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
                      border: 'none', background: 'white', cursor: 'pointer', textAlign: 'left',
                      borderBottom: isExpanded ? '1px solid var(--sm)' : 'none',
                    }}>
                    <span style={{ fontSize: 20 }}>{g.family.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{g.family.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--km)' }}>
                        {selectedCount > 0 ? t('n_selected', { n: selectedCount, m: g.members.length }) : t('none_selected')}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: 'var(--km)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>›</span>
                  </button>

                  {/* Seleziona tutti - SEMPRE VISIBILE */}
                  <button type="button" onClick={() => toggleAllMembers(g.members)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--sm)',
                      background: allSelected ? 'var(--ac)' : 'var(--ab)',
                      color: allSelected ? 'white' : 'var(--k)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                    {allSelected ? t('deselect_all') : t('select_all')}
                  </button>

                  {/* Contenuto tendina */}
                  {isExpanded && (
                    <div style={{ padding: 10, background: 'var(--ab)', borderTop: '1px solid var(--sm)' }}>
                      {/* Membri singoli */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {g.members.map((m) => {
                          const selected = splitMembers.includes(m.id);
                          return (
                            <button key={m.id} type="button" onClick={() => toggleSplitMember(m.id)}
                              style={chipMember(selected, m)}>
                              {selected && <span>✓ </span>}
                              <Avatar m={m} small />
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Riepilogo split */}
            {splitMembers.length > 0 && splitMode === 'equal' && totalAmount > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ac)', fontWeight: 600 }}>
                {t('expenses_split_each')}: € {equalShare.toFixed(2)}
              </div>
            )}

            {/* Input custom per ogni membro */}
            {splitMembers.length > 0 && splitMode === 'custom' && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {splitMembers.map((mid) => {
                  const m = members.find((x) => x.id === mid);
                  return (
                    <div key={mid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar m={m} />
                      <span style={{ flex: 1, fontSize: 13 }}>{m?.name}</span>
                      <input type="number" step="0.01" inputMode="decimal" className="input" style={{ width: 100 }}
                        placeholder="0,00"
                        value={customAmounts[mid] || ''}
                        onChange={(e) => setCustomAmounts({ ...customAmounts, [mid]: e.target.value })} />
                      <span style={{ fontSize: 12, color: 'var(--km)' }}>€</span>
                    </div>
                  );
                })}
                <div style={{ marginTop: 4, fontSize: 12, textAlign: 'right',
                  color: Math.abs(customTotal - totalAmount) < 0.01 ? 'var(--gn)' : 'var(--rd)', fontWeight: 600 }}>
                  {t('expenses_split_remaining')}: € {(totalAmount - customTotal).toFixed(2)}
                </div>
              </div>
            )}
          </div>

          {/* Foto/Allegati */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <span>{t('attach_photo_optional')} <span style={{ color: 'var(--km)', fontSize: 11 }}>(opzionale)</span></span>
            </label>
            <input type="file" id="expense-file-input" multiple accept="image/*" capture
              onChange={handleFileSelect}
              style={{ display: 'none' }} />
            <button type="button" onClick={() => document.getElementById('expense-file-input').click()}
              style={{
                width: '100%', padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                color: 'var(--ac)', transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.target.style.borderColor = 'var(--ac)'}
              onMouseLeave={(e) => e.target.style.borderColor = 'var(--sm)'}>
              {t('take_or_attach_photo')}
            </button>

            {attachments.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8 }}>
                {attachments.map((att, idx) => (
                  <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sm)' }}>
                    <img src={att.preview} style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '1' }} alt={`Attachment ${idx}`} />
                    <button type="button" onClick={() => removeAttachment(idx)}
                      style={{
                        position: 'absolute', top: 2, right: 2, width: 20, height: 20,
                        borderRadius: '50%', background: 'var(--rd)', color: 'white',
                        border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {err && <div className="login-msg error" style={{ marginTop: 12 }}>{err}</div>}

          <div className="row" style={{ marginTop: 20 }}>
            <button type="button" className="btn secondary" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn" disabled={busy || !totalAmount}>
              {busy ? <span className="spin" /> : t('add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Avatar({ m, small }) {
  if (!m) return null;
  const size = small ? 18 : 22;
  return (
    <span style={{
      width: size, height: size, borderRadius: small ? 6 : 7,
      background: m.avatar_color || '#1C1611', color: 'white',
      fontSize: small ? 10 : 11, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{m.avatar_letter || m.name.charAt(0).toUpperCase()}</span>
  );
}

function chip(active) {
  return {
    padding: '6px 12px', borderRadius: 100, border: '1.5px solid',
    borderColor: active ? 'var(--ac)' : 'var(--sm)',
    background: active ? 'var(--ac)' : 'white',
    color: active ? 'white' : 'var(--k)',
    fontSize: 12, fontWeight: 600,
  };
}

function chipMember(selected, m) {
  return {
    padding: '6px 10px', borderRadius: 100, border: '1.5px solid',
    borderColor: selected ? 'var(--k)' : 'var(--sm)',
    background: selected ? 'var(--k)' : 'white',
    color: selected ? 'white' : 'var(--k)',
    fontSize: 12, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };
}
