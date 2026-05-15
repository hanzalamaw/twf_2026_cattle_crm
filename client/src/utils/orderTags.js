/** Shared affluent / special-request tagging for operations modules. */

export const DAY_OPTIONS = ['Day 1', 'Day 2', 'Day 3'];

export const AFFLUENT_ROW_STYLE = {
  background: '#FFF7F7',
  borderLeft: '3px solid #D32F2F',
};

export const SPECIAL_REQUEST_ROW_STYLE = {
  background: '#FFFBF0',
  borderLeft: '3px solid #F9A825',
};

export function normalizeForCompare(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeDayLabel(value) {
  const n = normalizeForCompare(value);
  if (n === 'day 1' || n === 'day1' || n === '1') return 'Day 1';
  if (n === 'day 2' || n === 'day2' || n === '2') return 'Day 2';
  if (n === 'day 3' || n === 'day3' || n === '3') return 'Day 3';
  return String(value || '').trim() || '';
}

export function getDescriptionText(source) {
  if (!source) return '';

  const normalize = (v) =>
    String(v || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  const originalMap = new Map();

  const addValue = (val) => {
    const norm = normalize(val);
    if (!norm) return;
    if (!originalMap.has(norm)) {
      originalMap.set(norm, String(val).trim());
    }
  };

  [
    source.description,
    source.descriptions,
    source.description_csv,
    source.descriptions_csv,
    source.special_request,
    source.specialRequest,
    source.request,
    source.remarks,
    source.notes,
    source.note,
  ].forEach(addValue);

  (source.orders || []).forEach((o) => {
    addValue(o.description);
  });

  return Array.from(originalMap.values()).join(' | ');
}

export function hasDescription(source) {
  return getDescriptionText(source).length > 0;
}

export function nonWaqfHissaCount(source, totalField = 'total_hissa', waqfField = 'total_waqf_hissa') {
  const totalHissa = Number(source?.[totalField] ?? source?.hissa_count ?? 0);
  const waqfHissa = Number(source?.[waqfField] ?? source?.waqf_hissa_count ?? 0);
  return totalHissa - waqfHissa;
}

/** Affluent: has description and total hissa minus waqf is 3 or more. */
export function isAffluentOrder(source, totalField = 'total_hissa', waqfField = 'total_waqf_hissa') {
  return hasDescription(source) && nonWaqfHissaCount(source, totalField, waqfField) >= 3;
}

/** Special request: has description and total hissa minus waqf is 2 or less. */
export function isSpecialRequestOrder(source, totalField = 'total_hissa', waqfField = 'total_waqf_hissa') {
  return hasDescription(source) && nonWaqfHissaCount(source, totalField, waqfField) <= 2;
}

export function getOrderTag(source, totalField = 'total_hissa', waqfField = 'total_waqf_hissa') {
  if (isAffluentOrder(source, totalField, waqfField)) return 'affluent';
  if (isSpecialRequestOrder(source, totalField, waqfField)) return 'special_request';
  return null;
}

export function getChallanRowHighlight(tag) {
  if (tag === 'affluent') return AFFLUENT_ROW_STYLE;
  if (tag === 'special_request') return SPECIAL_REQUEST_ROW_STYLE;
  return { background: null, borderLeft: '3px solid transparent' };
}

export function batchesForDay(batches, day) {
  const want = normalizeDayLabel(day);
  if (!want) return batches || [];
  return (batches || []).filter((b) => normalizeDayLabel(b.day) === want);
}

export function latestBatchIdForDay(batches, day) {
  const list = batchesForDay(batches, day);
  if (!list.length) return null;
  return list[0].batch_id;
}

export function batchMatchesDay(batch, day) {
  if (!day) return true;
  return normalizeDayLabel(batch?.day) === normalizeDayLabel(day);
}
