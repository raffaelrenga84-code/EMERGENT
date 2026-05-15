import { useEffect } from 'react';
import { supabase } from './supabase.js';

/**
 * Hook per sincronizzare i dati Google al login:
 *  - avatar_url (foto profilo Google)
 *  - display_name / member.name (se mancanti)
 *
 * Aggiorna sia profiles che tutti i members dell'utente, ma solo se i campi
 * sono mancanti (così non sovrascrive valori inseriti manualmente).
 *
 * NOTA: la sincronizzazione automatica del compleanno via Google People API
 * è stata rimossa per evitare il warning "app non verificata".
 * Gli utenti possono inserire il compleanno a mano nel profilo.
 */
export function useGoogleAvatar(session, profile) {
  useEffect(() => {
    if (!session || !profile) return;

    const userId = session.user.id;

    const sync = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const meta = user.user_metadata || {};
        const avatarUrl = meta.picture || meta.avatar_url || null;
        const fullName = meta.full_name || meta.name || null;

        // 1. Avatar e nome -> profiles (solo se mancanti)
        const profileUpdate = {};
        if (avatarUrl && !profile.avatar_url) profileUpdate.avatar_url = avatarUrl;
        if (fullName && (!profile.display_name || profile.display_name.includes('@'))) {
          profileUpdate.display_name = fullName;
        }
        if (Object.keys(profileUpdate).length > 0) {
          await supabase.from('profiles').update(profileUpdate).eq('id', userId);
        }

        // 2. Avatar -> members dell'utente (solo dove avatar_url è null)
        if (avatarUrl) {
          await supabase
            .from('members')
            .update({ avatar_url: avatarUrl })
            .eq('user_id', userId)
            .is('avatar_url', null);
        }
      } catch (err) {
        console.warn('useGoogleAvatar sync error:', err);
      }
    };

    sync();
  }, [session?.user?.id, profile?.id]);
}
