import { useMemo, useState } from 'react';
import { toLocalYMD } from '../lib/dateUtils.js';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';
import { useAndroidBack } from '../lib/useAndroidBack.js';
import { isIOS } from '../lib/platformDetect.js';
import { isImageFile, DOC_ACCEPT } from '../lib/fileKind.js';
import { EXPENSE_CATEGORIES } from '../lib/expenseCategories.js';

export default function AddExpenseModal({ familyId, families = [], members, defaultPaidBy, authorMemberId, prefilledTask = null, prefilledExpense = null, editingExpense = null, prefilledShares = [], onClose, onCreated }) {
  const { t } = useT();
  useAndroidBack(true, onClose);
  // editingExpense → modalità MODIFICA (update invece di insert)
  // prefilledExpense → precompila (usato da "ripeti ultima" e "⧉ duplica")
  const base = editingExpense || prefilledExpense;
  const [selectedFamily, setSelectedFamily] = useState(prefilledTask?.family_id || base?.family_id || familyId || (families.length > 0 ? families[0].id : ''));
  const [amount, setAmount] = useState(base?.amount ? String(base.amount) : '');
  const [description, setDescription] = useState(
    prefilledTask
      ? `Pagamento: ${prefilledTask.title}`
      : (base?.description || '')
  );
  const [category, setCategory] = useState(base?.category || null);
  // "Pagato da" NON assume più che sia l'autore: scelta esplicita
  // obbligatoria (chi registra la spesa non è per forza chi ha pagato).
  const [paidBy, setPaidBy] = useState(base?.paid_by || '');
  const [paidAt, setPaidAt] = useState(
    editingExpense?.paid_at ? String(editingExpense.paid_at).slice(0, 10) : toLocalYMD()
  );
  // Quote iniziali da edit/duplica: stessi partecipanti; modalità custom se
  // gli importi non sono tutti uguali.
  const initShares = Array.isArray(prefilledShares) ? prefilledShares : [];
  const initAmounts = initShares.map((sh) => Number(sh.amount) || 0);
  const initEqual = initAmounts.length <= 1 ||
    initAmounts.every((a) => Math.abs(a - initAmounts[0]) < 0.011);
  const [splitMode, setSplitMode] = useState(initShares.length > 0 && !initEqual ? 'custom' : 'equal');
  const [splitMembers, setSplitMembers] = useState(initShares.map((sh) => sh.member_id));
  const [customAmounts, setCustomAmounts] = useState(() => {
    const m = {};
    for (const sh of initShares) m[sh.member_id] = String(sh.amount ?? '');
    return m;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [expandedFamilies, setExpandedFamilies] = useState({}); // {familyId: boolean}
  const [attachments, setAttachments] = useState([]); // {file, preview, name}

  // Filtra members della famiglia selezionata
  const familyMembers = members.filter((m) => m.family_id === selectedFamily);

  // Membri raggruppati per famiglia
  // In vista "Tutte" (familyId=null): mostra tutte le famiglie
  // Altrimenti: mostra solo la famiglia selezionata
  // In vista "Tutte" e in MODIFICA si vedono tutte le famiglie: una spesa
  // può coinvolgere membri di una famiglia diversa da quella "di default"
  // (era il bug: family[0] silenziosa → famiglia sbagliata sulla spesa).
  const showAllFamilies = !familyId || !!editingExpense;
  const byFamily = showAllFamilies ? families.map((f) => ({
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
      if (!isImageFile(file.name)) {
        // Documento (PDF, ecc.): niente anteprima immagine
        setAttachments((prev) => [...prev, { file, preview: null, name: file.name }]);
        return;
      }
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
    if (!paidBy) {
      setErr(t('addexpense_need_payer') || 'Seleziona chi ha pagato la spesa');
      return;
    }
    // La famiglia della spesa segue le PERSONE, non la vista: prima la
    // famiglia del pagatore, poi quella del primo partecipante alla
    // divisione, e solo in ultimo il default della vista.
    const payerMember = members.find((m) => m.id === paidBy);
    const firstSplitMember = members.find((m) => m.id === splitMembers[0]);
    const effectiveFamily = payerMember?.family_id
      || firstSplitMember?.family_id
      || selectedFamily;
    if (!effectiveFamily) return;
    setBusy(true); setErr('');

    let expense;
    if (editingExpense) {
      // ============ MODIFICA ============
      const { data, error: e1 } = await supabase.from('expenses').update({
        family_id: effectiveFamily,
        amount: totalAmount,
        description: description.trim() || null,
        category: category || null,
        paid_by: paidBy || null,
        paid_at: paidAt || null,
      }).eq('id', editingExpense.id).select().single();
      if (e1) { setErr(e1.message); setBusy(false); return; }
      expense = data;

      // Ricrea le quote PRESERVANDO lo stato "saldato" di chi c'era già
      // (chi aveva già pagato non deve tornare debitore per una modifica).
      const prevSettled = {};
      for (const sh of initShares) {
        if (sh.settled) prevSettled[sh.member_id] = sh.settled_at || new Date().toISOString();
      }
      await supabase.from('expense_shares').delete().eq('expense_id', expense.id);
      if (splitMembers.length > 0) {
        const shares = splitMembers.map((mid) => ({
          expense_id: expense.id,
          member_id: mid,
          amount: splitMode === 'equal' ? equalShare : (parseFloat(customAmounts[mid]) || 0),
          settled: mid === paidBy || !!prevSettled[mid],
          settled_at: mid === paidBy
            ? new Date().toISOString()
            : (prevSettled[mid] || null),
        }));
        const { error: e2 } = await supabase.from('expense_shares').insert(shares);
        if (e2) { setErr(e2.message); setBusy(false); return; }
      }
    } else {
      // ============ NUOVA (o duplicata) ============
      const { data, error: e1 } = await supabase.from('expenses').insert({
        family_id: effectiveFamily,
        task_id: prefilledTask?.id || null,
        amount: totalAmount,
        currency: 'EUR',
        description: description.trim() || null,
        category: category || null,
        paid_by: paidBy || null,
        paid_at: paidAt || null,
        created_by: authorMemberId || null,
      }).select().single();

      if (e1) { setErr(e1.message); setBusy(false); return; }
      expense = data;

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
        <h2>{editingExpense ? (t('exp_edit_h') || 'Modifica spesa') : t('addexpense_h')}</h2>
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
          {!editingExpense && familyId && families.length > 1 && (
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

          {/* Picker categoria — orizzontale, scroll su mobile.
              Click su una pill → seleziona; click di nuovo → deseleziona. */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', marginBottom: 6 }}>
              {t('addexpense_category') || 'Categoria'}
            </label>
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: '4px 2px', margin: '0 -2px',
              scrollbarWidth: 'none',
            }} data-testid="addexpense-category-picker">
              {EXPENSE_CATEGORIES.map((cat) => {
                const active = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(active ? null : cat.key)}
                    data-testid={`addexpense-cat-${cat.key}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 12px', borderRadius: 100,
                      border: active ? `2px solid ${cat.color}` : '1.5px solid var(--sm)',
                      background: active ? `${cat.color}15` : 'white',
                      color: active ? cat.color : 'var(--km)',
                      fontSize: 12, fontWeight: 700, lineHeight: 1.2,
                      cursor: 'pointer', flexShrink: 0,
                      transition: 'all 150ms ease',
                    }}>
                    <span style={{ fontSize: 14 }}>{cat.emoji}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>{t(cat.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="who">{t('addexpense_paid_by')}</label>
            <select id="who" className="input"
              value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              <option value="">{t('addexpense_payer_placeholder') || '— Chi ha pagato? —'}</option>
              {byFamily.length > 1
                ? byFamily.map((g) => (
                    <optgroup key={g.family?.id} label={`${g.family?.emoji || ''} ${g.family?.name || ''}`.trim()}>
                      {g.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  ))
                : (byFamily[0]?.members || familyMembers).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
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
            <input type="file" id="expense-file-input" multiple
              accept={isIOS() ? `image/*,${DOC_ACCEPT}` : 'image/*'}
              data-testid="add-expense-file-input"
              onChange={handleFileSelect}
              style={{ display: 'none' }} />
            <input type="file" id="expense-file-input-doc" multiple accept={DOC_ACCEPT}
              data-testid="add-expense-file-input-doc"
              onChange={handleFileSelect}
              style={{ display: 'none' }} />
            <input type="file" id="expense-file-input-camera" multiple accept="image/*" capture="environment"
              onChange={handleFileSelect}
              style={{ display: 'none' }} />
            {isIOS() ? (
              <button type="button" onClick={() => document.getElementById('expense-file-input').click()}
                style={{
                  width: '100%', padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                  background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  color: 'var(--ac)',
                }}>
                {t('take_or_attach_photo')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => document.getElementById('expense-file-input-camera').click()}
                  style={{
                    flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                    background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    color: 'var(--ac)',
                  }}>
                  📷 {t('take_photo') || 'Foto'}
                </button>
                <button type="button" onClick={() => document.getElementById('expense-file-input').click()}
                  style={{
                    flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                    background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    color: 'var(--ac)',
                  }}>
                  🖼️ {t('from_gallery') || 'Galleria'}
                </button>
                <button type="button" onClick={() => document.getElementById('expense-file-input-doc').click()}
                  data-testid="add-expense-attach-file-btn"
                  style={{
                    flex: 1, padding: 14, borderRadius: 12, border: '2px dashed var(--sm)',
                    background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    color: 'var(--ac)',
                  }}>
                  📎 File
                </button>
              </div>
            )}

            {attachments.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8 }}>
                {attachments.map((att, idx) => (
                  <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sm)' }}>
                    {att.preview ? (
                      <img src={att.preview} style={{ width: '100%', height: '100%', objectFit: 'cover', aspectRatio: '1' }} alt={`Attachment ${idx}`} />
                    ) : (
                      <div style={{
                        width: '100%', aspectRatio: '1', background: 'var(--ab)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 3, padding: 4, boxSizing: 'border-box',
                      }}>
                        <span style={{ fontSize: 18 }}>📄</span>
                        <span style={{
                          fontSize: 8, fontWeight: 600, color: 'var(--km)',
                          wordBreak: 'break-all', textAlign: 'center',
                          maxHeight: 22, overflow: 'hidden',
                        }}>{att.name}</span>
                      </div>
                    )}
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
              {busy ? <span className="spin" /> : (editingExpense ? (t('save_changes') || 'Salva modifiche') : t('add'))}
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
