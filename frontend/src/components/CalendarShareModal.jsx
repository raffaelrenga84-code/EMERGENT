import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useT } from '../lib/i18n.jsx';

/**
 * CalendarShareModal — condivide il calendario famiglia via link ICS/webcal.
 * i18n: dizionario locale it/en/fr/de (pattern EditFamilyModal), via `lang`.
 */
const L = {
  it: {
    h: '📅 Calendario condiviso',
    sub1: 'Aggiungi gli eventi di ',
    sub2: ' al calendario nativo del tuo telefono. Aggiornamento automatico, promemoria 30 minuti prima di ogni evento — niente da configurare.',
    urlLabel: 'URL calendario (privato)',
    addPhone: '📲 Aggiungi al telefono',
    copied: '✓ Copiato', copyBtn: '📋 Copia',
    hint: 'Sul telefono "Aggiungi al telefono" apre direttamente il calendario nativo. Su PC usa "Copia".',
    iosH: '📱 iPhone / iPad',
    ios1a: 'Tocca ', ios1b: '"Aggiungi al telefono"', ios1c: ' qui sopra: si apre Calendario di Apple, conferma.',
    iosManual: 'Manuale', iosManualSteps: ": Impostazioni → Calendario → Account → Aggiungi → Altro → Aggiungi calendario sottoscritto → incolla l'URL.",
    andH: '🤖 Android / Google',
    and1a: 'Apri ', and1b: 'calendar.google.com', and1c: ' da PC (non funziona dall\u2019app) → a sinistra "Altri calendari" → ',
    and1d: ' → Da URL → incolla. Dopo qualche minuto gli eventi compaiono nel calendario del tuo telefono Android.',
    privacyH: 'Privacy:', privacyTxt: ' chi ha questo URL può leggere gli eventi della famiglia. Tienilo riservato. Se finisce nelle mani sbagliate, premi "Rigenera" qui sotto.',
    close: 'Chiudi', regen: '🔄 Rigenera URL',
    regenConfirm: 'Generare un nuovo URL? Il vecchio smetterà di funzionare. Tutti dovranno risottoscriversi.',
  },
  en: {
    h: '📅 Shared calendar',
    sub1: 'Add the events of ',
    sub2: " to your phone's native calendar. Automatic updates, reminders 30 minutes before each event — nothing to configure.",
    urlLabel: 'Calendar URL (private)',
    addPhone: '📲 Add to phone',
    copied: '✓ Copied', copyBtn: '📋 Copy',
    hint: 'On the phone, "Add to phone" opens the native calendar directly. On PC use "Copy".',
    iosH: '📱 iPhone / iPad',
    ios1a: 'Tap ', ios1b: '"Add to phone"', ios1c: ' above: Apple Calendar opens, confirm.',
    iosManual: 'Manual', iosManualSteps: ': Settings → Calendar → Accounts → Add → Other → Add subscribed calendar → paste the URL.',
    andH: '🤖 Android / Google',
    and1a: 'Open ', and1b: 'calendar.google.com', and1c: ' on a PC (it doesn\u2019t work from the app) → on the left "Other calendars" → ',
    and1d: ' → From URL → paste. After a few minutes the events appear in your Android phone\u2019s calendar.',
    privacyH: 'Privacy:', privacyTxt: ' anyone with this URL can read the family events. Keep it private. If it ends up in the wrong hands, press "Regenerate" below.',
    close: 'Close', regen: '🔄 Regenerate URL',
    regenConfirm: 'Generate a new URL? The old one will stop working. Everyone will need to re-subscribe.',
  },
  fr: {
    h: '📅 Calendrier partagé',
    sub1: 'Ajoutez les événements de ',
    sub2: ' au calendrier natif de votre téléphone. Mise à jour automatique, rappels 30 minutes avant chaque événement — rien à configurer.',
    urlLabel: 'URL du calendrier (privée)',
    addPhone: '📲 Ajouter au téléphone',
    copied: '✓ Copié', copyBtn: '📋 Copier',
    hint: 'Sur le téléphone, « Ajouter au téléphone » ouvre directement le calendrier natif. Sur PC, utilisez « Copier ».',
    iosH: '📱 iPhone / iPad',
    ios1a: 'Touchez ', ios1b: '« Ajouter au téléphone »', ios1c: " ci-dessus : le Calendrier d'Apple s'ouvre, confirmez.",
    iosManual: 'Manuel', iosManualSteps: " : Réglages → Calendrier → Comptes → Ajouter → Autre → Ajouter un cal. avec abonnement → collez l'URL.",
    andH: '🤖 Android / Google',
    and1a: 'Ouvrez ', and1b: 'calendar.google.com', and1c: " sur PC (ça ne marche pas depuis l'app) → à gauche « Autres agendas » → ",
    and1d: ' → À partir de l\u2019URL → collez. Après quelques minutes, les événements apparaissent dans le calendrier de votre téléphone Android.',
    privacyH: 'Confidentialité :', privacyTxt: ' toute personne ayant cette URL peut lire les événements de la famille. Gardez-la privée. Si elle tombe entre de mauvaises mains, appuyez sur « Régénérer » ci-dessous.',
    close: 'Fermer', regen: '🔄 Régénérer l\u2019URL',
    regenConfirm: 'Générer une nouvelle URL ? L\u2019ancienne cessera de fonctionner. Tout le monde devra se réabonner.',
  },
  de: {
    h: '📅 Geteilter Kalender',
    sub1: 'Füge die Ereignisse von ',
    sub2: ' zum nativen Kalender deines Handys hinzu. Automatische Aktualisierung, Erinnerungen 30 Minuten vor jedem Ereignis — nichts zu konfigurieren.',
    urlLabel: 'Kalender-URL (privat)',
    addPhone: '📲 Zum Handy hinzufügen',
    copied: '✓ Kopiert', copyBtn: '📋 Kopieren',
    hint: 'Auf dem Handy öffnet „Zum Handy hinzufügen" direkt den nativen Kalender. Am PC „Kopieren" verwenden.',
    iosH: '📱 iPhone / iPad',
    ios1a: 'Tippe oben auf ', ios1b: '„Zum Handy hinzufügen"', ios1c: ': der Apple-Kalender öffnet sich, bestätige.',
    iosManual: 'Manuell', iosManualSteps: ': Einstellungen → Kalender → Accounts → Hinzufügen → Andere → Kalenderabo hinzufügen → URL einfügen.',
    andH: '🤖 Android / Google',
    and1a: 'Öffne ', and1b: 'calendar.google.com', and1c: ' am PC (aus der App funktioniert es nicht) → links „Weitere Kalender" → ',
    and1d: ' → Per URL → einfügen. Nach ein paar Minuten erscheinen die Ereignisse im Kalender deines Android-Handys.',
    privacyH: 'Privatsphäre:', privacyTxt: ' wer diese URL hat, kann die Familienereignisse lesen. Halte sie geheim. Falls sie in falsche Hände gerät, drücke unten auf „Neu generieren".',
    close: 'Schließen', regen: '🔄 URL neu generieren',
    regenConfirm: 'Neue URL generieren? Die alte funktioniert dann nicht mehr. Alle müssen sich neu abonnieren.',
  },
};

export default function CalendarShareModal({ family, onClose, onChanged }) {
  const { lang } = useT();
  const tr = L[lang] || L.it;
  const [icalToken, setIcalToken] = useState(family.ical_token);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const url = `${window.location.origin}/api/ical/${icalToken}.ics`;
  const webcalUrl = url.replace(/^https?:/, 'webcal:');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const regenerate = async () => {
    if (!confirm(tr.regenConfirm)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('regenerate_ical_token', { family: family.id });
    if (error) { alert(error.message); setBusy(false); return; }
    setIcalToken(data);
    setBusy(false);
    onChanged && onChanged();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{tr.h}</h2>
        <p className="modal-sub">
          {tr.sub1}<strong>{family.name}</strong>{tr.sub2}
        </p>

        <label>{tr.urlLabel}</label>
        <div style={{
          padding: 12, background: 'white', border: '1px solid var(--sm)', borderRadius: 12,
          fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--km)',
          marginBottom: 8,
        }}>
          {url}
        </div>

        <div className="row">
          <a href={webcalUrl} className="btn" style={{ flex: 1, textDecoration: 'none', textAlign: 'center', display: 'inline-block' }}>
            {tr.addPhone}
          </a>
          <button type="button" className="btn secondary" onClick={copy}>
            {copied ? tr.copied : tr.copyBtn}
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--km)', textAlign: 'center', marginTop: 8 }}>
          {tr.hint}
        </p>

        <h3 style={{ fontFamily: 'var(--fs)', fontSize: 16, marginTop: 24, marginBottom: 8 }}>
          {tr.iosH}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.6 }}>
          {tr.ios1a}<strong>{tr.ios1b}</strong>{tr.ios1c} <br/>
          <em>{tr.iosManual}</em>{tr.iosManualSteps}
        </p>

        <h3 style={{ fontFamily: 'var(--fs)', fontSize: 16, marginTop: 16, marginBottom: 8 }}>
          {tr.andH}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.6 }}>
          {tr.and1a}<strong>{tr.and1b}</strong>{tr.and1c}<strong>+</strong>{tr.and1d}
        </p>

        <div style={{ marginTop: 24, padding: 12, background: 'var(--amB)', borderRadius: 12, fontSize: 12, color: 'var(--am)' }}>
          ⚠️ <strong>{tr.privacyH}</strong>{tr.privacyTxt}
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button type="button" className="btn secondary" onClick={onClose}>{tr.close}</button>
          <button type="button" className="btn danger" onClick={regenerate} disabled={busy}>
            {busy ? <span className="spin" /> : tr.regen}
          </button>
        </div>
      </div>
    </div>
  );
}
