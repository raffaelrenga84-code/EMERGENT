import { Component } from 'react';

/**
 * Error boundary che cattura qualsiasi errore di rendering React
 * e mostra un messaggio in chiaro nella lingua del device.
 * Indipendente da i18n.jsx (cosi' funziona anche se i18n e' rotto).
 */

const ERR_T = {
  it: {
    title: 'Qualcosa è andato storto',
    desc: 'FAMMY ha incontrato un errore inaspettato. Prova a ricaricare la pagina o, se il problema persiste, pulisci i dati locali e rifai login.',
    reload: '🔄 Ricarica pagina',
    clear: '🧹 Pulisci dati e logout',
    retry: 'Riprova senza ricaricare',
    send: "✉️ Invia all'assistenza",
    sent: '✓ Email aperta!',
    details: 'Dettagli tecnici',
    mail_subject: 'FAMMY - Errore inaspettato',
    mail_body: 'Ciao, ho ricevuto questo errore in FAMMY:\n\n',
    mail_intro_error: '----- Errore -----',
    mail_intro_page: '----- Pagina -----',
    mail_intro_device: '----- Dispositivo -----',
    mail_intro_time: '----- Ora -----',
  },
  en: {
    title: 'Something went wrong',
    desc: 'FAMMY encountered an unexpected error. Try reloading the page, or if the problem persists, clear local data and log in again.',
    reload: '🔄 Reload page',
    clear: '🧹 Clear data and log out',
    retry: 'Retry without reloading',
    send: '✉️ Send to support',
    sent: '✓ Email opened!',
    details: 'Technical details',
    mail_subject: 'FAMMY - Unexpected error',
    mail_body: 'Hi, I got this error in FAMMY:\n\n',
    mail_intro_error: '----- Error -----',
    mail_intro_page: '----- Page -----',
    mail_intro_device: '----- Device -----',
    mail_intro_time: '----- Time -----',
  },
  fr: {
    title: "Quelque chose s'est mal passé",
    desc: "FAMMY a rencontré une erreur inattendue. Essaie de recharger la page, ou si le problème persiste, efface les données locales et reconnecte-toi.",
    reload: '🔄 Recharger la page',
    clear: '🧹 Effacer les données et déconnexion',
    retry: 'Réessayer sans recharger',
    send: '✉️ Envoyer au support',
    sent: '✓ Email ouvert !',
    details: 'Détails techniques',
    mail_subject: 'FAMMY - Erreur inattendue',
    mail_body: "Bonjour, j'ai eu cette erreur dans FAMMY :\n\n",
    mail_intro_error: '----- Erreur -----',
    mail_intro_page: '----- Page -----',
    mail_intro_device: '----- Appareil -----',
    mail_intro_time: '----- Heure -----',
  },
  de: {
    title: 'Etwas ist schiefgelaufen',
    desc: 'FAMMY ist auf einen unerwarteten Fehler gestoßen. Versuche die Seite neu zu laden, oder wenn das Problem weiterhin besteht, lösche die lokalen Daten und melde dich erneut an.',
    reload: '🔄 Seite neu laden',
    clear: '🧹 Daten löschen und abmelden',
    retry: 'Erneut versuchen ohne neu zu laden',
    send: '✉️ An Support senden',
    sent: '✓ E-Mail geöffnet!',
    details: 'Technische Details',
    mail_subject: 'FAMMY - Unerwarteter Fehler',
    mail_body: 'Hallo, ich habe diesen Fehler in FAMMY erhalten:\n\n',
    mail_intro_error: '----- Fehler -----',
    mail_intro_page: '----- Seite -----',
    mail_intro_device: '----- Gerät -----',
    mail_intro_time: '----- Zeit -----',
  },
};

function detectLang() {
  try {
    const browserLang = (navigator.language || navigator.userLanguage || 'it').toLowerCase().split('-')[0];
    if (['it', 'en', 'fr', 'de'].includes(browserLang)) return browserLang;
  } catch (e) {}
  return 'it';
}

const SUPPORT_EMAIL = 'raffael.renga84@gmail.com';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, sent: false };
    this.lang = detectLang();
    this.tr = ERR_T[this.lang] || ERR_T.it;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('FAMMY crashed:', error, info);
  }

  reset = () => {
    this.setState({ error: null, info: null, sent: false });
  };

  fullReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {}
    window.location.href = '/';
  };

  sendToSupport = () => {
    const stack = (this.state.error?.stack || String(this.state.error)).slice(0, 2000);
    const userAgent = navigator.userAgent || 'unknown';
    const url = window.location.href || 'unknown';
    const t = this.tr;
    const body =
      t.mail_body +
      t.mail_intro_error + '\n' + stack +
      '\n\n' + t.mail_intro_page + '\n' + url +
      '\n\n' + t.mail_intro_device + '\n' + userAgent +
      '\n\n' + t.mail_intro_time + '\n' + new Date().toISOString() +
      '\n';
    const href = 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent(t.mail_subject) + '&body=' + encodeURIComponent(body);
    window.location.href = href;
    this.setState({ sent: true });
  };

  render() {
    if (this.state.error) {
      const stack = (this.state.error?.stack || String(this.state.error)).slice(0, 800);
      const message = String(this.state.error?.message || this.state.error || '').slice(0, 400);
      const t = this.tr;
      return (
        <div style={{
          padding: 24, maxWidth: 600, margin: '40px auto',
          background: '#fff', borderRadius: 16,
          border: '2px solid #E74C3C',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ marginTop: 0 }}>{t.title}</h2>
          <p style={{ color: '#666' }}>{t.desc}</p>
          {message && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: '#FFF3E0',
              border: '1.5px solid #E67E22',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'monospace',
              color: '#C0392B',
              wordBreak: 'break-word',
            }}>
              {message}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px', background: '#2A6FDB', color: 'white',
                border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
              }}>
              {t.reload}
            </button>
            <button onClick={this.fullReset}
              style={{
                padding: '10px 18px', background: '#E74C3C', color: 'white',
                border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
              }}>
              {t.clear}
            </button>
            <button onClick={this.reset}
              style={{
                padding: '10px 18px', background: 'white', color: '#666',
                border: '1.5px solid #ccc', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
              }}>
              {t.retry}
            </button>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={this.sendToSupport}
              style={{
                width: '100%',
                padding: '12px 18px', background: '#2E7D52', color: 'white',
                border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
                fontSize: 15,
              }}>
              {this.state.sent ? t.sent : t.send}
            </button>
          </div>
          <details style={{ marginTop: 20, fontSize: 12, color: '#888' }}>
            <summary style={{ cursor: 'pointer' }}>{t.details}</summary>
            <pre style={{
              marginTop: 8, padding: 12, background: '#f5f5f5',
              borderRadius: 8, overflow: 'auto', maxHeight: 300,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{stack}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
