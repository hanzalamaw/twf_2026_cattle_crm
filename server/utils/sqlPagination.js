/**
 * Build LIMIT/OFFSET as SQL literals (not `?` placeholders).
 * Some MySQL/MariaDB + mysql2 setups fail on `LIMIT ? OFFSET ?` in prepared statements
 * (500 / ER_WRONG_ARGUMENTS). Values are clamped to safe integers — safe to interpolate.
 */
export function limitOffsetClause(limit, offset, { maxLimit = 500, defaultLimit = 50 } = {}) {
  let lim = Math.floor(Number(limit));
  if (!Number.isFinite(lim) || lim < 1) lim = defaultLimit;
  lim = Math.min(maxLimit, lim);

  let off = Math.floor(Number(offset));
  if (!Number.isFinite(off) || off < 0) off = 0;
  off = Math.min(off, 10_000_000);

  return `LIMIT ${lim} OFFSET ${off}`;
}
