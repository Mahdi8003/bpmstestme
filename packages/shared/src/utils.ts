export function getJalaliYear(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  return Number(year ?? 1404);
}

export function formatReference(prefix: string, year: number, sequence: number): string {
  return `${prefix.toUpperCase()}-${year}-${String(sequence).padStart(4, '0')}`;
}

export function slugifyKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function nextWorkingHours(hours: number, from = new Date()): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
