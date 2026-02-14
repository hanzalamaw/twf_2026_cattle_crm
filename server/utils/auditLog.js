/**
 * Write a main event to audit_logs (shown in Control Management > Audit logs).
 * Uses base schema columns only (no session_id).
 * @param {object} db - MySQL connection
 * @param {object} opts - user_id (optional), action, entity_type, entity_id (optional), old_values (optional), new_values (optional), ip_address (optional), user_agent (optional)
 */
export async function writeAuditLog(db, opts) {
  const {
    user_id = null,
    action,
    entity_type,
    entity_id = null,
    old_values = null,
    new_values = null,
    ip_address = null,
    user_agent = null
  } = opts;
  try {
    await db.execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        action,
        entity_type,
        entity_id,
        old_values != null ? JSON.stringify(old_values) : null,
        new_values != null ? JSON.stringify(new_values) : null,
        ip_address,
        user_agent
      ]
    );
  } catch (error) {
    console.error("[auditLog] insert failed:", error?.message);
  }
}
