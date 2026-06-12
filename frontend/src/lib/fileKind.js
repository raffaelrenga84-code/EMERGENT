// fileKind.js — riconoscimento tipo file per gli allegati.
const IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'avif'];

export function isImageFile(name = '') {
  const ext = String(name).split('.').pop()?.toLowerCase();
  return IMG_EXT.includes(ext);
}

// Accept "documenti" SENZA image/*: su Android image/* forza il chooser
// Camera/Galleria e nasconde il file manager (bug segnalato dall'utente).
export const DOC_ACCEPT = 'application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
