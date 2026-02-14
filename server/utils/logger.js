/**
 * Central logger for main application events.
 * Format: [ISO timestamp] [EVENT] category message (optional meta)
 */
const ts = () => new Date().toISOString();

export const log = (category, message, meta = null) => {
  const metaStr = meta != null ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${ts()}] [EVENT] ${category} ${message}${metaStr}`);
};

export const logError = (category, message, error) => {
  console.error(`[${ts()}] [EVENT] ${category} ${message}`, error?.message ?? error);
};
