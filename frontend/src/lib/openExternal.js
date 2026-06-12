// openExternal — apre un URL esterno SENZA rischiare di navigare la PWA.
//
// Su iOS in modalità standalone, `window.open(url, '_blank')` può lasciare
// la PWA su una pagina morta/bianca al rientro (es. dopo il redirect
// wa.me → WhatsApp). Un anchor temporaneo con target=_blank + rel=noopener
// è il modo più affidabile per delegare l'apertura al sistema operativo
// mantenendo intatto il contesto della PWA.
export function openExternal(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
