/**
 * Generate a stitch ID in the format S-YYYYMMDD-xxxx
 * where xxxx is a 4-character hex suffix for uniqueness
 */
export function generateStitchId(): string {
  const now = new Date();
  const dateStr = formatDate(now);
  const suffix = generateHexSuffix(4);
  return `S-${dateStr}-${suffix}`;
}

/**
 * Format a date as YYYYMMDD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Generate a random hex string of the specified length
 */
function generateHexSuffix(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Validate that a string is a valid stitch ID format
 */
export function isValidStitchId(id: string): boolean {
  return /^S-\d{8}-[a-f0-9]{4}$/.test(id);
}

/**
 * Extract the date portion from a stitch ID
 */
export function extractDateFromId(id: string): Date | null {
  const match = id.match(/^S-(\d{4})(\d{2})(\d{2})-/);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(
    parseInt(year!, 10),
    parseInt(month!, 10) - 1,
    parseInt(day!, 10)
  );
}
