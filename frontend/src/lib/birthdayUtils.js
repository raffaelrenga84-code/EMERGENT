/**
 * Utility per gestire i compleanni
 */

/**
 * Calcola l'età in base alla data di nascita
 */
export function getAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Controlla se oggi è il compleanno di una persona
 */
export function isBirthdayToday(birthDate) {
  if (!birthDate) return false;
  const today = new Date();
  const birth = new Date(birthDate);
  return today.getMonth() === birth.getMonth() && today.getDate() === birth.getDate();
}

/**
 * Controlla se domani è il compleanno di una persona
 */
export function isBirthdayTomorrow(birthDate) {
  if (!birthDate) return false;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const birth = new Date(birthDate);
  return tomorrow.getMonth() === birth.getMonth() && tomorrow.getDate() === birth.getDate();
}

/**
 * Ottiene la data del prossimo compleanno (per il calendario)
 */
export function getNextBirthdayDate(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);

  // Crea la data del compleanno di quest'anno
  let nextBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

  // Se il compleanno è già passato quest'anno, usa l'anno prossimo
  if (nextBirthday < today) {
    nextBirthday.setFullYear(today.getFullYear() + 1);
  }

  return nextBirthday;
}

/**
 * Formatta una data di nascita in formato leggibile (es. "25 Dicembre")
 */
export function formatBirthday(birthDate) {
  if (!birthDate) return '';
  const date = new Date(birthDate + 'T00:00:00Z');
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
}

/**
 * Crea un evento ricorrente per il compleanno
 * Ritorna i dati per l'evento
 */
export function createBirthdayEventData(member) {
  if (!member.birth_date) return null;

  const birth = new Date(member.birth_date + 'T00:00:00Z');
  const nextBirthday = getNextBirthdayDate(member.birth_date);
  const age = getAge(member.birth_date);

  return {
    title: `🎂 Compleanno di ${member.name}${age ? ` (${age + 1} anni)` : ''}`,
    description: `Compleanno di ${member.name}. Data di nascita: ${formatBirthday(member.birth_date)}`,
    starts_at: nextBirthday.toISOString().split('T')[0], // Solo data
    category: 'other',
    is_recurring: true,
    recurrence_rule: `RRULE:FREQ=YEARLY;BYMONTH=${birth.getMonth() + 1};BYMONTHDAY=${birth.getDate()}`,
  };
}
