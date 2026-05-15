import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import AddMemberModal from '../../components/AddMemberModal.jsx';
import EditMemberModal from '../../components/EditMemberModal.jsx';
import EditFamilyModal from '../../components/EditFamilyModal.jsx';
import FamilyInviteModal from '../../components/FamilyInviteModal.jsx';

export default function FamilyTab({ family, members, session, families, activeFamily, isAll, onSwitchFamily, onNewFamily, onChanged }) {
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [editingFamily, setEditingFamily] = useState(false);
  const [showFamilyInvite, setShowFamilyInvite] = useState(null); // family object o null
  const [expandedFamilies, setExpandedFamilies] = useState({});
  const [inviteMenuOpen, setInviteMenuOpen] = useState(null);
  const [editingFamilyAll, setEditingFamilyAll] = useState(null);
  const [addMemberToFamily, setAddMemberToFamily] = useState(null); // family object da vista Tutte

  const toggleFamilyExpanded = (familyId) => {
    setExpandedFamilies((prev) => ({ ...prev, [familyId]: !prev[familyId] }));
  };

  const isOwner = family?.created_by === session.user.id;

  const removeMember = async (member) => {
    if (member.user_id === session.user.id) {
      alert('Non puoi rimuovere te stesso da una famiglia.');
      return;
    }
    if (!confirm(`Rimuovere ${member.name} dalla famiglia?`)) return;
    await supabase.from('members').delete().eq('id', member.id);
    onChanged();
  };

  const otherFamiliesFor = (member, currentFamilyId) => {
    if (!member.user_id) return [];
    const otherMembershipFamilyIds = members
      .filter((m) => m.user_id === member.user_id && m.family_id !== currentFamilyId)
      .map((m) => m.family_id);
    return (families || []).filter((f) => otherMembershipFamilyIds.includes(f.id));
  };

  if (isAll) {
    return (
      <>
        <div style={{ padding: '0 22px 8px' }}>
          <div className="sh-l" style={{ padding: 0 }}>{t('nav_family')}</div>
        </div>

        {families.map((f) => {
          const familyMembers = members.filter((m) => m.family_id === f.id);
          const isExpanded = expandedFamilies[f.id] || false;
          const inviteOpen = inviteMenuOpen === f.id;
          const isFamilyOwner = f.created_by === session.user.id;
          return (
            <div key={f.id} style={{
              marginBottom: 12, position: 'relative',
              background: 'white', border: '1px solid var(--sm)',
              borderRadius: 12, overflow: 'hidden',
            }}>
              <button
                onClick={() => toggleFamilyExpanded(f.id)}
                style={{
                  width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: 12,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left',
                }}>
                <span style={{ fontSize: 28 }}>{f.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--km)', marginTop: 2 }}>
                    {familyMembers.length} {familyMembers.length === 1 ? t('member_one_label') : t('member_many_label')}
                  </div>
                </div>
                <span style={{
                  fontSize: 20, color: 'var(--km)', transition: 'transform 0.2s ease',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)'
                }}>›</span>
              </button>

              <div style={{
                display: 'flex', alignItems: 'stretch',
                borderTop: '1px solid var(--sm)',
                background: '#F7F4ED',
              }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setInviteMenuOpen(inviteOpen ? null : f.id); }}
                  style={{
                    flex: 1, padding: '10px 12px', background: 'transparent',
                    border: 'none', borderRight: isFamilyOwner ? '1px solid var(--sm)' : 'none',
                    cursor: 'pointer', fontSize: 13, color: 'var(--ac)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                  title="Invita">
                  💌 Invita
                </button>
                {isFamilyOwner && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingFamilyAll(f); }}
                    style={{
                      width: 56, padding: '10px 12px', background: 'transparent',
                      border: 'none', cursor: 'pointer', fontSize: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Modifica famiglia (solo creatore)">
                    ⚙️
                  </button>
                )}
              </div>

              {inviteOpen && (
                <div style={{
                  background: 'white', borderTop: '1px solid var(--sm)', padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--km)', textTransform: 'uppercase' }}>
                    Condividi invito
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/invite/${f.invite_token || 'temp'}`);
                      setInviteMenuOpen(null);
                    }}
                    style={{
                      padding: '10px 12px', background: 'var(--ab)', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, color: 'var(--ac)', cursor: 'pointer',
                    }}>
                    🔗 Copia link
                  </button>
                  <button
                    onClick={() => {
                      const text = `Unisciti a ${f.name} su Fammy! 🎉 ${window.location.origin}/invite/${f.invite_token || 'temp'}`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
                      setInviteMenuOpen(null);
                    }}
                    style={{
                      padding: '10px 12px', background: '#25D366', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
                    }}>
                    💬 WhatsApp
                  </button>
                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: `Unisciti a ${f.name}`,
                          text: `Unisciti a ${f.name} su Fammy!`,
                          url: `${window.location.origin}/invite/${f.invite_token || 'temp'}`,
                        });
                      }
                      setInviteMenuOpen(null);
                    }}
                    style={{
                      padding: '10px 12px', background: 'var(--ab)', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600, color: 'var(--ac)', cursor: 'pointer',
                    }}>
                    📤 Condividi
                  </button>
                </div>
              )}

              {isExpanded && (
                <>
                  <div className="list" style={{ borderTop: '1px solid var(--sm)' }}>
                    {familyMembers.map((m) => (
                      <MemberCard
                        key={m.id}
                        member={m}
                        isMe={m.user_id === session.user.id}
                        isOwner={m.user_id === f.created_by}
                        otherFamilies={otherFamiliesFor(m, f.id)}
                        onEdit={() => setEditingMember(m)}
                        onRemove={() => removeMember(m)}
                        onInvite={() => setShowFamilyInvite(f)}
                      />
                    ))}
                  </div>
                  {/* Azioni espanse: aggiungi membro + invita link */}
                  <div style={{
                    padding: '12px', display: 'flex', flexDirection: 'column', gap: 8,
                    borderTop: '1px solid var(--sm)', background: '#FBFAF7',
                  }}>
                    <button className="btn full secondary" onClick={() => setAddMemberToFamily(f)}>
                      {t('add_member')}
                    </button>
                    <button className="btn full" onClick={() => setShowFamilyInvite(f)}>
                      {t('invite_with_link')}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        <div style={{ padding: '8px 16px 16px' }}>
          <button className="btn full secondary" onClick={onNewFamily} style={{ borderStyle: 'dashed' }}>
            {t('new_family_btn')}
          </button>
        </div>

        {editingFamilyAll && (
          <EditFamilyModal
            family={editingFamilyAll}
            onClose={() => setEditingFamilyAll(null)}
            onSaved={() => { setEditingFamilyAll(null); onChanged(); }}
            onDeleted={() => { setEditingFamilyAll(null); onChanged(); }}
          />
        )}

        {editingMember && (
          <EditMemberModal
            member={editingMember}
            onClose={() => setEditingMember(null)}
            onSaved={() => { setEditingMember(null); onChanged(); }}
          />
        )}

        {addMemberToFamily && (
          <AddMemberModal
            familyId={addMemberToFamily.id}
            onClose={() => setAddMemberToFamily(null)}
            onCreated={() => { setAddMemberToFamily(null); onChanged(); }}
          />
        )}

        {showFamilyInvite && (
          <FamilyInviteModal
            family={showFamilyInvite}
            session={session}
            onClose={() => setShowFamilyInvite(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ padding: '0 22px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="sh-l" style={{ padding: 0 }}>{t('nav_family')}</div>
        {isOwner && (
          <button className="link-btn" onClick={() => setEditingFamily(true)}>
            ⚙️ {t('edit')}
          </button>
        )}
      </div>

      <div className="list">
        {members.filter(m => m.family_id === family.id).map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            isMe={m.user_id === session.user.id}
            isOwner={m.user_id === family.created_by}
            otherFamilies={otherFamiliesFor(m, family.id)}
            onEdit={() => setEditingMember(m)}
            onRemove={() => removeMember(m)}
            onInvite={() => setShowFamilyInvite(family)}
          />
        ))}
      </div>

      <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn full secondary" onClick={() => setShowAdd(true)}>
          + {t('addmember_h')}
        </button>
        <button className="btn full" onClick={() => setShowFamilyInvite(family)}>
          {t('family_invite_link')}
        </button>
      </div>

      {showAdd && (
        <AddMemberModal
          familyId={family.id}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); onChanged(); }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => { setEditingMember(null); onChanged(); }}
        />
      )}

      {editingFamily && (
        <EditFamilyModal
          family={family}
          onClose={() => setEditingFamily(false)}
          onSaved={() => { setEditingFamily(false); onChanged(); }}
          onDeleted={() => { setEditingFamily(false); onChanged(); }}
        />
      )}

      {showFamilyInvite && (
        <FamilyInviteModal
          family={showFamilyInvite}
          session={session}
          onClose={() => setShowFamilyInvite(null)}
        />
      )}
    </>
  );
}

function MemberCard({ member, isMe, isOwner, otherFamilies = [], onEdit, onRemove, onInvite }) {
  const { t } = useT();
  const canInvite = !isMe && !member.user_id;

  return (
    <div className="member-card" onClick={onEdit}>
      <Avatar
        name={member.name}
        avatarUrl={member.avatar_url}
        avatarLetter={member.avatar_letter}
        avatarColor={member.avatar_color || '#1C1611'}
        size={40}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          {member.name}
          {isMe && <span style={{ fontSize: 11, color: 'var(--km)', fontWeight: 500 }}>(tu)</span>}
        </div>
        <div style={{ color: 'var(--km)', fontSize: 13 }}>
          {member.role || t('member_one_label')}
          {member.user_id ? ' · ' + t('has_account') : ' · ' + t('no_account')}
        </div>
        {otherFamilies.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--km)', alignSelf: 'center' }}>{t('also_in')}</span>
            {otherFamilies.map((f) => (
              <span key={f.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 8px', borderRadius: 100,
                background: f.color ? `${f.color}22` : 'var(--ab)',
                color: f.color || 'var(--ac)',
                fontSize: 10, fontWeight: 600,
              }}>
                {f.emoji} {f.name}
              </span>
            ))}
          </div>
        )}
        {member.birthday && (
          <div style={{ color: 'var(--km)', fontSize: 12, marginTop: 3 }}>
            🎂 {new Date(member.birthday).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        )}
      </div>

      {isOwner && (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 4,
          background: '#FF6B6B', color: 'white', textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>OWNER</span>
      )}
      {!isOwner && member.user_id && (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 4,
          background: 'var(--km)', color: 'white', textTransform: 'uppercase',
          letterSpacing: 0.5, opacity: 0.6,
        }}>MEMBER</span>
      )}

      {canInvite && (
        <button
          onClick={(e) => { e.stopPropagation(); onInvite(); }}
          style={{
            background: 'var(--ab)', border: 'none', color: 'var(--ac)', fontSize: 12,
            fontWeight: 600, padding: '6px 10px', borderRadius: 100,
          }}
          title="Invita via link">
          💌
        </button>
      )}
      {!isMe && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: 'none', border: 'none', color: 'var(--rd)', fontSize: 18, padding: 8 }}
          title="Rimuovi">
          ✕
        </button>
      )}
    </div>
  );
}
