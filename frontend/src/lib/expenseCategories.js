/**
 * Categorie spesa FAMMY + costanti UI condivise.
 *
 * Usata da AddExpenseModal (picker) e SpeseTab/ExpenseRow (display).
 *
 * Pattern: ogni categoria ha `key`, `emoji`, `labelKey` (i18n).
 * Colore preso da palette CSS via `var(--...)`.
 */
export const EXPENSE_CATEGORIES = [
  { key: 'groceries', emoji: '🛒', labelKey: 'expense_cat_groceries', color: '#5BAF6B' },
  { key: 'bills',     emoji: '💡', labelKey: 'expense_cat_bills',     color: '#E3A92A' },
  { key: 'school',    emoji: '🎒', labelKey: 'expense_cat_school',    color: '#5B7FAF' },
  { key: 'home',      emoji: '🏠', labelKey: 'expense_cat_home',      color: '#A65A3A' },
  { key: 'health',    emoji: '🩺', labelKey: 'expense_cat_health',    color: '#C44E5C' },
  { key: 'transport', emoji: '🚗', labelKey: 'expense_cat_transport', color: '#7BAFC4' },
  { key: 'leisure',   emoji: '🎉', labelKey: 'expense_cat_leisure',   color: '#B57AC4' },
  { key: 'other',     emoji: '💶', labelKey: 'expense_cat_other',     color: '#7A7A7A' },
];

export function getCategory(key) {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)
    || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]; // fallback "other"
}
