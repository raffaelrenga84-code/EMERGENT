/**
 * Componente Avatar
 * Mostra foto profilo se disponibile, altrimenti mostra lettera con colore
 */
export default function Avatar({
  name,
  avatarUrl,
  avatarLetter,
  avatarColor = '#1C1611',
  size = 32,
  style = {},
}) {
  const letter = avatarLetter || name?.charAt(0)?.toUpperCase() || '?';

  const baseStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: size > 24 ? 8 : 4,
    overflow: 'hidden',
    flexShrink: 0,
    width: size,
    height: size,
    fontSize: Math.floor(size * 0.4),
    fontWeight: 700,
    ...style,
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          ...baseStyle,
          objectFit: 'cover',
        }}
        onError={(e) => {
          // Se l'immagine non carica, mostra la lettera
          e.target.style.display = 'none';
          const fallback = document.createElement('div');
          Object.assign(fallback.style, {
            ...baseStyle,
            background: avatarColor,
            color: 'white',
            position: 'absolute',
          });
          fallback.textContent = letter;
          e.target.parentElement.appendChild(fallback);
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...baseStyle,
        background: avatarColor,
        color: 'white',
      }}
    >
      {letter}
    </div>
  );
}
