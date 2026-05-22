import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useT } from '../../lib/i18n.jsx';
import Avatar from '../../components/Avatar.jsx';
import AddMemberModal from '../../components/AddMemberModal.jsx';
import EditMemberModal from '../../components/EditMemberModal.jsx';
import EditFamilyModal from '../../components/EditFamilyModal.jsx';
import FamilyInviteModal from '../../components/FamilyInviteModal.jsx';
import JoinFamilyByCodeModal from '../../components/JoinFamilyByCodeModal.jsx';
import AbsenceModal from '../../components/AbsenceModal.jsx';
import WhoIsWhereTimeline from '../../components/WhoIsWhereTimeline.jsx';
import { findActiveAbsence, absenceLabel, fmtAbsenceRange } from '../../lib/useAbsences.js';

// Mostra il ruolo nella lingua corrente. Preset → traduzione `role_<id>`.
// I ruoli "custom" inseriti dall'utente vengono mostrati così come sono.
function translateRole(role, t) {
  if (!role) return '';
  const key = role === 'papà' ? 'role_papa' : `role_${role}`;
  const translated = t(key);
  return translated === key ? role : translated;
}

export default function FamilyTab({ family, members, session, families, activeFamily, isAll, absences = [], profile, tasks = [], onSwitchFamily, onNewFamily, onChanged }) {
  const { t } = useT();
  const [showAdd, setShowAdd] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [editingFamily, setEditingFamily] = useState(false);
  const [showFamilyInvite, setShowFamilyInvite] = useState(null); // family object o null
  const [showAbsence, setShowAbsence] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState(null);
  const [expandedFamilies, setExpandedFamilies] = useState({});
  const [editingFamilyAll, setEditingFamilyAll] = useState(null);
  const [addMemberToFamily, setAddMemberToFamily] = useState(null); // family object da vista Tutte
  const [showJoinCode, setShowJoinCode] = useState(false);

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
                  onClick={(e) => { e.stopPropagation(); setShowFamilyInvite(f); }}
                  data-testid={`family-quick-invite-${f.id}`}
                  style={{
                    flex: 1, padding: '10px 12px', background: 'transparent',
                    border: 'none', borderRight: isFamilyOwner ? '1px solid var(--sm)' : 'none',
                    cursor: 'pointer', fontSize: 13, color: 'var(--ac)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                  title={t('invite_btn')}>
                  💌 {t('invite_btn')}
                </button>
                {isFamilyOwner && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingFamilyAll(f); }}
                    style={{
                      width: 56, padding: '10px 12px', background: 'transparent',
                      border: 'none', cursor: 'pointer', fontSize: 16,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title={t('family_edit_title')}>
                    ⚙️
                  </button>
                )}
              </div>

              {isExpanded && (
                <>
                  <div className="list" style={{ borderTop: '1px solid var(--sm)' }}>
                    {familyMembers.map((m) => {
                      const activeAbs = findActiveAbsence(absences, m.user_id);
                      return (
                        <MemberCard
                          key={m.id}
                          member={m}
                          isMe={m.user_id === session.user.id}
                          isOwner={m.user_id === f.created_by}
                          otherFamilies={otherFamiliesFor(m, f.id)}
                          activeAbsence={activeAbs}
                          onEdit={() => setEditingMember(m)}
                          onRemove={() => removeMember(m)}
                          onInvite={() => setShowFamilyInvite(f)}
                          onSetAbsence={
                            m.user_id === session.user.id
                              ? () => { setEditingAbsence(activeAbs); setShowAbsence(true); }
                              : null
                          }
                        />
                      );
                    })}
                  </div>
                  {/* Azione espansa: aggiungi membro (l'invito è già nel bottone sopra) */}
                  <div style={{
                    padding: '12px',
                    borderTop: '1px solid var(--sm)', background: '#FBFAF7',
                  }}>
                    <button className="btn full secondary" onClick={() => setAddMemberToFamily(f)}>
                      {t('add_member')}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn full secondary" onClick={onNewFamily} style={{ borderStyle: 'dashed' }}
            data-testid="family-tab-new-family-btn">
            {t('new_family_btn')}
          </button>
          <button className="btn full secondary" onClick={() => setShowJoinCode(true)}
            data-testid="family-tab-join-code-btn"
            style={{ borderStyle: 'dashed' }}>
            🎟️ Ho un codice invito
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

        {showJoinCode && (
          <JoinFamilyByCodeModal
            profile={null}
            onClose={() => setShowJoinCode(false)}
            onJoined={() => { setShowJoinCode(false); onChanged && onChanged(); }}
          />
        )}

        {showAbsence && (
          <AbsenceModal
            session={session}
            profile={profile}
            families={families}
            tasks={tasks}
            members={members}
            editingAbsence={editingAbsence}
            onClose={() => { setShowAbsence(false); setEditingAbsence(null); }}
            onSaved={() => { setShowAbsence(false); setEditingAbsence(null); onChanged && onChanged(); }}
          />
        )}
      </>
    );
  }

  const familyMembersOfThis = members.filter(m => m.family_id === family.id);

  return (
    <>
      {/* Hero header famiglia: emoji grande + nome + contatore membri */}
      <div style={{
        padding: '4px 22px 14px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        {family.photo_url ? (
          <div
            data-testid="family-hero-photo"
            style={{
              width: 56, height: 56, flexShrink: 0,
              borderRadius: 16,
              background: `url(${family.photo_url}) center/cover no-repeat`,
              boxShadow: '0 4px 12px rgba(28,22,17,0.15)',
              border: '2px solid white',
            }}
          />
        ) : (
          <span style={{
            fontSize: 40, lineHeight: 1, flexShrink: 0,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))',
          }}>{family.emoji}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{
            margin: 0, fontFamily: 'var(--fs)', fontSize: 22, fontWeight: 500,
            letterSpacing: '-0.02em', color: 'var(--k)', lineHeight: 1.15,
          }} data-testid="family-name-header">{family.name}</h2>
          <div style={{
            fontSize: 12, color: 'var(--km)', marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600,
          }} data-testid="family-members-counter">
            <span>👥</span>
            <span>
              {familyMembersOfThis.length}{' '}
              {familyMembersOfThis.length === 1 ? t('member_one_label') : t('member_many_label')}
            </span>
          </div>
        </div>
        {isOwner && (
          <button
            className="link-btn"
            onClick={() => setEditingFamily(true)}
            data-testid="family-edit-btn"
            style={{
              padding: '8px 12px', borderRadius: 100,
              background: 'var(--ab)', border: '1px solid var(--sm)',
              fontSize: 12, fontWeight: 600, color: 'var(--km)',
              flexShrink: 0,
            }}>
            ⚙️ {t('edit')}
          </button>
        )}
      </div>

      {/* Mini-row avatar membri (max 5 + overflow counter) */}
      {familyMembersOfThis.length > 0 && (
        <div style={{
          padding: '0 22px 14px',
          display: 'flex', alignItems: 'center', gap: 6,
        }} data-testid="family-avatar-row">
          {familyMembersOfThis.slice(0, 5).map((m, idx) => (
            <div
              key={m.id}
              title={m.name}
              style={{
                width: 32, height: 32, borderRadius: 10,
                background: m.avatar_color || '#1C1611',
                color: 'white', fontWeight: 700, fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: idx === 0 ? 0 : -8,
                border: '2.5px solid white',
                boxShadow: '0 2px 5px rgba(28,22,17,0.12)',
                zIndex: 5 - idx,
              }}>
              {m.avatar_letter || m.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          ))}
          {familyMembersOfThis.length > 5 && (
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'var(--ab)',
              color: 'var(--km)', fontWeight: 700, fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: -8,
              border: '2.5px solid white',
              boxShadow: '0 2px 5px rgba(28,22,17,0.12)',
            }}>
              +{familyMembersOfThis.length - 5}
            </div>
          )}
        </div>
      )}

      <div className="list">
        {familyMembersOfThis.map((m) => {
          const activeAbs = findActiveAbsence(absences, m.user_id);
          return (
            <MemberCard
              key={m.id}
              member={m}
              isMe={m.user_id === session.user.id}
              isOwner={m.user_id === family.created_by}
              otherFamilies={otherFamiliesFor(m, family.id)}
              activeAbsence={activeAbs}
              onEdit={() => setEditingMember(m)}
              onRemove={() => removeMember(m)}
              onInvite={() => setShowFamilyInvite(family)}
              onSetAbsence={
                m.user_id === session.user.id
                  ? () => { setEditingAbsence(activeAbs); setShowAbsence(true); }
                  : null
              }
            />
          );
        })}
      </div>

      {/* Timeline "🌍 Chi è dove" — assenze visibili a questa famiglia */}
      <WhoIsWhereTimeline
        absences={absences}
        members={familyMembersOfThis}
        familyId={family.id}
        onEditAbsence={(abs) => {
          if (abs.user_id !== session.user.id) return; // solo le mie
          setEditingAbsence(abs);
          setShowAbsence(true);
        }}
      />

      <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn full secondary" onClick={() => setShowAdd(true)}>
          + {t('addmember_h')}
        </button>
        <button
          className="btn full"
          onClick={() => setShowFamilyInvite(family)}
          data-testid="family-invite-cta"
          style={{
            background: 'linear-gradient(135deg, var(--ac) 0%, #B5563D 100%)',
            color: 'white', border: 'none',
            padding: '14px 18px', borderRadius: 16,
            fontSize: 15, fontWeight: 700, letterSpacing: '0.01em',
            boxShadow: '0 8px 22px rgba(193,98,75,0.32)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 12px 28px rgba(193,98,75,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 22px rgba(193,98,75,0.32)';
          }}
        >
          <span style={{ fontSize: 20 }}>💌</span>
          <span>{t('family_invite_link')}</span>
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

      {showJoinCode && (
        <JoinFamilyByCodeModal
          profile={null}
          onClose={() => setShowJoinCode(false)}
          onJoined={() => { setShowJoinCode(false); onChanged && onChanged(); }}
        />
      )}

      {showAbsence && (
        <AbsenceModal
          session={session}
          profile={profile}
          families={families}
          tasks={tasks}
          members={members}
          editingAbsence={editingAbsence}
          onClose={() => { setShowAbsence(false); setEditingAbsence(null); }}
          onSaved={() => { setShowAbsence(false); setEditingAbsence(null); onChanged && onChanged(); }}
        />
      )}
    </>
  );
}

function MemberCard({ member, isMe, isOwner, otherFamilies = [], activeAbsence, onEdit, onRemove, onInvite, onSetAbsence }) {
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
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {member.name}
          {isMe && <span style={{ fontSize: 11, color: 'var(--km)', fontWeight: 500 }}>(tu)</span>}
          {activeAbsence && (
            <span
              data-testid={`member-absence-badge-${member.id}`}
              style={{
                padding: '2px 8px', borderRadius: 100,
                background: 'rgba(243,156,18,0.18)',
                border: '1px solid rgba(243,156,18,0.5)',
                color: '#B36E00', fontSize: 11, fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
              title={fmtAbsenceRange(activeAbsence)}>
              {absenceLabel(activeAbsence)} · {fmtAbsenceRange(activeAbsence)}
            </span>
          )}
        </div>
        <div style={{ color: 'var(--km)', fontSize: 13 }}>
          {translateRole(member.role, t) || t('member_one_label')}
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
        {isMe && onSetAbsence && (
          <button
            type="button"
            data-testid="set-absence-btn"
            onClick={(e) => { e.stopPropagation(); onSetAbsence(); }}
            style={{
              marginTop: 6, padding: '4px 10px',
              fontSize: 11, fontWeight: 600,
              border: '1px solid var(--sm)', borderRadius: 100,
              background: 'white', color: 'var(--ac)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
            ✈️ {activeAbsence ? (t('manage_absence') || 'Gestisci assenza') : (t('set_absence') || 'Imposta assenza')}
          </button>
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
          data-testid={`member-invite-btn-${member.id}`}
          style={{
            background: 'linear-gradient(135deg, var(--ac) 0%, #B5563D 100%)',
            border: 'none', color: 'white',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
            padding: '7px 14px', borderRadius: 100,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            boxShadow: '0 4px 12px rgba(193,98,75,0.32)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(193,98,75,0.42)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(193,98,75,0.32)';
          }}
          title={t('invite_with_link')}>
          <span style={{ fontSize: 13 }}>💌</span>
          <span>{t('invite_btn')}</span>
        </button>
      )}
      {!isMe && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: 'none', border: 'none', color: 'var(--rd)', fontSize: 18, padding: 8 }}
          title={t('remove')}>
          ✕
        </button>
      )}
    </div>
  );
}
