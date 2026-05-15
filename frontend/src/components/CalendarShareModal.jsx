import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function CalendarShareModal({ family, onClose, onChanged }) {
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
    if (!confirm('Generare un nuovo URL? Il vecchio smetterà di funzionare. Tutti dovranno risottoscriversi.')) return;
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
        <h2>📅 Calendario condiviso</h2>
        <p className="modal-sub">
          Aggiungi gli eventi di <strong>{family.name}</strong> al calendario nativo del tuo telefono.
          Aggiornamento automatico, promemoria 30 minuti prima di ogni evento — niente da configurare.
        </p>

        <label>URL calendario (privato)</label>
        <div style={{
          padding: 12, background: 'white', border: '1px solid var(--sm)', borderRadius: 12,
          fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--km)',
          marginBottom: 8,
        }}>
          {url}
        </div>

        <div className="row">
          <a href={webcalUrl} className="btn" style={{ flex: 1, textDecoration: 'none', textAlign: 'center', display: 'inline-block' }}>
            📲 Aggiungi al telefono
          </a>
          <button type="button" className="btn secondary" onClick={copy}>
            {copied ? '✓ Copiato' : '📋 Copia'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--km)', textAlign: 'center', marginTop: 8 }}>
          Sul telefono "Aggiungi al telefono" apre direttamente il calendario nativo. Su PC usa "Copia".
        </p>

        <h3 style={{ fontFamily: 'var(--fs)', fontSize: 16, marginTop: 24, marginBottom: 8 }}>
          📱 iPhone / iPad
        </h3>
        <p style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.6 }}>
          Tocca <strong>"Aggiungi al telefono"</strong> qui sopra: si apre Calendario di Apple, conferma. <br/>
          <em>Manuale</em>: Impostazioni → Calendario → Account → Aggiungi → Altro → Aggiungi calendario sottoscritto → incolla l'URL.
        </p>

        <h3 style={{ fontFamily: 'var(--fs)', fontSize: 16, marginTop: 16, marginBottom: 8 }}>
          🤖 Android / Google
        </h3>
        <p style={{ fontSize: 13, color: 'var(--km)', lineHeight: 1.6 }}>
          Apri <strong>calendar.google.com</strong> da PC (non funziona dall'app) →
          a sinistra "Altri calendari" → <strong>+</strong> → Da URL → incolla. Dopo qualche minuto
          gli eventi compaiono nel calendario del tuo telefono Android.
        </p>

        <div style={{ marginTop: 24, padding: 12, background: 'var(--amB)', borderRadius: 12, fontSize: 12, color: 'var(--am)' }}>
          ⚠️ <strong>Privacy:</strong> chi ha questo URL può leggere gli eventi della famiglia.
          Tienilo riservato. Se finisce nelle mani sbagliate, premi "Rigenera" qui sotto.
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button type="button" className="btn secondary" onClick={onClose}>Chiudi</button>
          <button type="button" className="btn danger" onClick={regenerate} disabled={busy}>
            {busy ? <span className="spin" /> : '🔄 Rigenera URL'}
          </button>
        </div>
      </div>
    </div>
  );
}
