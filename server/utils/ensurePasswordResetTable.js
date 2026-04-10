/**
 * Ensures `password_reset_tokens` exists (forgot-password flow).
 * Older databases may have been created before this table was added to schema.sql.
 */
export async function ensurePasswordResetTable(db) {
  await db.execute(`
 CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token VARCHAR(64) NOT NULL PRIMARY KEY,
      user_id INT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_password_reset_user_id (user_id),
      CONSTRAINT password_reset_tokens_ibfk_1
        FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
}
