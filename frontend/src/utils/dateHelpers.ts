/**
 * Returns the local date as "YYYY-MM-DD" string.
 * Uses local time instead of toISOString() (which converts to UTC).
 * After 8pm EDT (UTC-4), toISOString() would return tomorrow's date — this fixes that.
 */
export function getLocalDateString(date?: Date): string {
  const d = date || new Date();
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts any Date object to local "YYYY-MM-DD" string.
 * Use for computed dates (e.g., loop over week days).
 */
export function toLocalDateString(date: Date): string {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
