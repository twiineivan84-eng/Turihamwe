import { ExpiryRecord } from '../types';

export type ExpiryHorizonFilter =
  | 'ALL'
  | 'AHEAD'
  | 'NEXT_7'
  | 'NEXT_30'
  | 'NEXT_90'
  | 'NEXT_365'
  | 'OVERDUE';

export const EXPIRY_MONTH_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

export interface ExpiryDateParts {
  iso: string;
  year: string;
  month: string;
  day: string;
}

export function parseExpiryDateParts(dateStr?: string | null): ExpiryDateParts | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim().substring(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) return null;
  return {
    iso: clean,
    year: match[1],
    month: match[2],
    day: match[3],
  };
}

export function getDaysInMonthForFilter(year?: string, month?: string): number {
  if (!month) return 31;
  const numericMonth = parseInt(month, 10);
  if (isNaN(numericMonth) || numericMonth < 1 || numericMonth > 12) return 31;
  // Use leap year 2024 when year is unselected so Feb 29 remains selectable across years
  const numericYear = year ? parseInt(year, 10) : 2024;
  const safeYear = isNaN(numericYear) ? 2024 : numericYear;
  return new Date(Date.UTC(safeYear, numericMonth, 0)).getUTCDate();
}

export function getAvailableExpiryYears(
  records: ReadonlyArray<Pick<ExpiryRecord, 'currentExpiryDate'>>,
  currentYear: number
): string[] {
  const yearSet = new Set<number>();
  for (let y = currentYear - 2; y <= currentYear + 5; y++) {
    yearSet.add(y);
  }
  for (const r of records) {
    const parts = parseExpiryDateParts(r.currentExpiryDate);
    if (parts) {
      const y = parseInt(parts.year, 10);
      if (!isNaN(y)) yearSet.add(y);
    }
  }
  return Array.from(yearSet)
    .sort((a, b) => a - b)
    .map(y => String(y));
}

export interface ExpiryQueueFilterCriteria {
  day?: string;
  month?: string;
  year?: string;
  horizon?: ExpiryHorizonFilter;
}

export function filterUpcomingExpiryRecords(
  records: ReadonlyArray<ExpiryRecord>,
  criteria: ExpiryQueueFilterCriteria
): ExpiryRecord[] {
  const { day, month, year, horizon = 'ALL' } = criteria;

  return records.filter(record => {
    const parts = parseExpiryDateParts(record.currentExpiryDate);

    if (year && parts?.year !== year) return false;
    if (month && parts?.month !== month) return false;
    if (day && parts?.day !== day) return false;

    switch (horizon) {
      case 'AHEAD':
        return record.daysUntilExpiry >= 0;
      case 'NEXT_7':
        return record.daysUntilExpiry >= 0 && record.daysUntilExpiry <= 7;
      case 'NEXT_30':
        return record.daysUntilExpiry >= 0 && record.daysUntilExpiry <= 30;
      case 'NEXT_90':
        return record.daysUntilExpiry >= 0 && record.daysUntilExpiry <= 90;
      case 'NEXT_365':
        return record.daysUntilExpiry >= 0 && record.daysUntilExpiry <= 365;
      case 'OVERDUE':
        return record.daysUntilExpiry < 0;
      case 'ALL':
      default:
        return true;
    }
  });
}
