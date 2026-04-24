import crypto from "crypto";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

const ALLOWED_STATUSES = ["Pending", "Rider Assigned", "Dispatched", "Delivered", "Returned to Farm"];
const REGENERATE_ALLOWED_EMAIL = "hanzalamawahab@gmail.com";
const OPERATIONS_YEAR = 2026;
const nonWaqfOrder = (alias = "o") => `LOWER(COALESCE(${alias}.order_type, '')) NOT LIKE '%waqf%'`;

function emitOperationsChanged(io, event, payload = {}) {
  if (!io) return;
  io.to("operations").emit("operations:changed", { event, ...payload, at: new Date().toISOString() });
  io.to("operations").emit(event, { ...payload, at: new Date().toISOString() });
}


// ── DB migration (run once on startup or via migration script) ───────────────
// ALTER TABLE challan ADD COLUMN IF NOT EXISTS batch_id INT NULL AFTER challan_id;
// ALTER TABLE challan DROP COLUMN IF EXISTS delivery_status;
// ALTER TABLE challan DROP COLUMN IF EXISTS rider_id; -- rider assignment now lives only in orders.rider_id
// CREATE TABLE IF NOT EXISTS challan_batch (
//   batch_id INT AUTO_INCREMENT PRIMARY KEY,
//   label VARCHAR(255) NOT NULL,
//   created_at DATETIME NOT NULL DEFAULT NOW()
// );

function normalizeAddr(a) {
  if (a == null) return "";
  return String(a).trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeSlot(s) {
  if (s == null || s === "") return "_none_";
  return String(s).trim();
}

function normalizeDay(d) {
  if (d == null || d === "") return "_none_";
  return String(d).trim();
}

function classifyHissa(orderType) {
  const t = (orderType || "").toLowerCase();
  if (t.includes("goat")) return "goat";
  if (t.includes("waqf")) return "waqf";
  if (t.includes("premium")) return "premium";
  return "standard";
}

const GSEP = "\x1F";

function groupKeyForOrder(row) {
  return `${normalizeDay(row.day)}${GSEP}${normalizeAddr(row.address)}`;
}

function uniqueRiderIdsFromOrders(orders = []) {
  return [...new Set(orders
    .map((o) => o.rider_id)
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map(Number))];
}

async function resolveSingleRiderFromOrders(db, orders = []) {
  const riderIds = uniqueRiderIdsFromOrders(orders);
  if (riderIds.length !== 1) return { rider: null, rider_id: null, rider_count: riderIds.length };
  const [rs] = await db.execute(`SELECT rider_id, rider_name, contact FROM riders WHERE rider_id = ?`, [riderIds[0]]);
  return { rider: rs[0] || null, rider_id: riderIds[0], rider_count: 1 };
}

async function fetchRoleOpsFlags(db, userId) {
  const [rows] = await db.execute(
    `SELECT r.operation_management, r.operation_general_dashboard, r.operation_customer_support,
            r.operation_rider_management, r.operation_deliveries_management, r.operation_challan_management
     FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

function requireOperationParent(req, res, flags) {
  if (!flags?.operation_management) {
    res.status(403).json({ message: "Operations access denied" });
    return false;
  }
  return true;
}

async function resolveLatestBatchId(db) {
  const [rows] = await db.execute(
    `SELECT batch_id FROM challan_batch ORDER BY created_at DESC, batch_id DESC LIMIT 1`
  );
  return rows[0]?.batch_id ?? null;
}

/**
 * @param {object} app
 * @param {import("mysql2/promise").Pool} db
 * @param {Function} verifyToken
 */
export const registerOperationsRoutes = (app, db, verifyToken, io = null) => {
  const assertSub = async (req, res, checker) => {
    const flags = await fetchRoleOpsFlags(db, req.userId);
    if (!requireOperationParent(req, res, flags)) return null;
    if (!checker(flags)) {
      res.status(403).json({ message: "Insufficient operations permission" });
      return null;
    }
    return flags;
  };

  // ── Batches list ────────────────────────────────────────────
  app.get("/api/operations/batches", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) =>
        f.operation_challan_management || f.operation_deliveries_management || f.operation_customer_support
      );
      if (!flags) return;
      const [rows] = await db.execute(
        `SELECT batch_id, label, created_at FROM challan_batch ORDER BY created_at DESC, batch_id DESC`
      );
      res.json({ batches: rows });
    } catch (error) {
      logError("OPERATIONS", "List batches error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Riders ---
  app.get("/api/operations/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) =>
        f.operation_rider_management || f.operation_deliveries_management || f.operation_challan_management
      );
      if (!flags) return;
      const [riders] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, availability, status FROM riders WHERE status = 'active' OR status IS NULL ORDER BY rider_name`
      );
      res.json(riders);
    } catch (error) {
      logError("OPERATIONS", "List riders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/riders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const { rider_name, contact, vehicle, cnic, number_plate, amount_per_delivery } = req.body;
      if (!rider_name || typeof rider_name !== "string") {
        return res.status(400).json({ message: "rider_name is required" });
      }
      const amount = amount_per_delivery == null || amount_per_delivery === "" ? 0 : Number(amount_per_delivery);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: "amount_per_delivery must be a valid non-negative number" });
      }
      const [result] = await db.execute(
        `INSERT INTO riders (rider_name, contact, vehicle, cnic, number_plate, amount_per_delivery, total_paid, availability, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'Available', 'active')`,
        [rider_name.trim(), contact || null, vehicle || null, cnic || null, number_plate || null, amount]
      );
      log("OPERATIONS", "Rider created", { rider_id: result.insertId });
      emitOperationsChanged(io, "riders:changed", { action: "created", rider_id: result.insertId });
      res.status(201).json({ rider_id: result.insertId });
    } catch (error) {
      logError("OPERATIONS", "Create rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Challan list (Challan Management page) ──────────────────
  // Returns aggregated contact/customer data from linked orders
  app.get("/api/operations/challans", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_challan_management || f.operation_deliveries_management);
      if (!flags) return;

      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      if (!batchId) return res.json({ challans: [] });

      const [rows] = await db.execute(
        `SELECT c.*,
                cb.label AS batch_label, cb.created_at AS batch_created_at,
                (SELECT CASE WHEN COUNT(DISTINCT o0.rider_id) = 1 THEN MAX(o0.rider_id) ELSE NULL END
                 FROM challan_orders co0 INNER JOIN orders o0 ON o0.order_id = co0.order_id
                 WHERE co0.challan_id = c.challan_id AND o0.rider_id IS NOT NULL AND ${nonWaqfOrder('o0')}) AS rider_id,
                (SELECT COUNT(DISTINCT o0b.rider_id)
                 FROM challan_orders co0b INNER JOIN orders o0b ON o0b.order_id = co0b.order_id
                 WHERE co0b.challan_id = c.challan_id AND o0b.rider_id IS NOT NULL AND ${nonWaqfOrder('o0b')}) AS rider_count,
                (SELECT COUNT(*) FROM challan_orders co INNER JOIN orders ox ON ox.order_id = co.order_id WHERE co.challan_id = c.challan_id AND ${nonWaqfOrder('ox')}) AS order_count,
                -- Aggregated from linked orders
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.shareholder_name), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co2 INNER JOIN orders o ON o.order_id = co2.order_id WHERE co2.challan_id = c.challan_id) AS shareholders_csv,
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.contact), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co3 INNER JOIN orders o ON o.order_id = co3.order_id WHERE co3.challan_id = c.challan_id) AS contacts_csv,
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.alt_contact), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co4 INNER JOIN orders o ON o.order_id = co4.order_id WHERE co4.challan_id = c.challan_id AND NULLIF(TRIM(o.alt_contact), '') IS NOT NULL) AS alt_contacts_csv,
                (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.customer_id), '') ORDER BY o.order_id SEPARATOR ', ')
                 FROM challan_orders co5 INNER JOIN orders o ON o.order_id = co5.order_id WHERE co5.challan_id = c.challan_id AND NULLIF(TRIM(o.customer_id), '') IS NOT NULL) AS customer_ids_csv,
                -- Delivery progress from linked orders
                (SELECT COUNT(*) FROM challan_orders co6
                 INNER JOIN orders o2 ON o2.order_id = co6.order_id
                 WHERE co6.challan_id = c.challan_id AND o2.delivery_status = 'Delivered') AS orders_delivered,
                (SELECT COUNT(*) FROM challan_orders co7
                 INNER JOIN orders o3 ON o3.order_id = co7.order_id
                 WHERE co7.challan_id = c.challan_id) AS orders_total
         FROM challan c
         LEFT JOIN challan_batch cb ON cb.batch_id = c.batch_id
         WHERE c.batch_id = ? AND COALESCE(c.total_hissa, 0) > 0
         ORDER BY c.day, c.slot, c.challan_id`,
        [batchId]
      );
      res.json({ challans: rows, batch_id: batchId });
    } catch (error) {
      logError("OPERATIONS", "List challans error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Challan detail by QR token ──────────────────────────────
  app.get("/api/operations/challans/by-token/:token", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management || f.operation_customer_support);
      if (!flags) return;
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(400).json({ message: "Invalid token" });
      const [ch] = await db.execute(
        `SELECT c.*, cb.label AS batch_label FROM challan c
         LEFT JOIN challan_batch cb ON cb.batch_id = c.batch_id
         WHERE c.qr_token = ?`,
        [token]
      );
      if (ch.length === 0) return res.status(404).json({ message: "Challan not found" });
      const challan = ch[0];
      const [orderRows] = await db.execute(
        `SELECT o.order_id, o.booking_name, o.shareholder_name, o.contact, o.alt_contact,
                o.address, o.area, o.day, o.slot, o.order_type, o.cow_number, o.hissa_number,
                o.description, o.delivery_status, o.rider_id, o.customer_id
         FROM orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         WHERE co.challan_id = ? AND ${nonWaqfOrder('o')}
         ORDER BY o.order_id`,
        [challan.challan_id]
      );
      const riderInfo = await resolveSingleRiderFromOrders(db, orderRows);
      const rider = riderInfo.rider;
      const statuses = orderRows.map((o) => o.delivery_status || "Pending");
      const allDelivered = statuses.length > 0 && statuses.every((s) => s === "Delivered");
      const anyReturned  = statuses.some((s) => s === "Returned to Farm");
      const anyDispatched = statuses.some((s) => s === "Dispatched");
      const anyRiderAssigned = statuses.some((s) => s === "Rider Assigned");
      let derivedStatus = "Pending";
      if (allDelivered) derivedStatus = "Delivered";
      else if (anyReturned) derivedStatus = "Returned to Farm";
      else if (anyDispatched) derivedStatus = "Dispatched";
      else if (anyRiderAssigned) derivedStatus = "Rider Assigned";

      res.json({ challan: { ...challan, rider_id: riderInfo.rider_id, rider_count: riderInfo.rider_count, derived_status: derivedStatus }, orders: orderRows, rider });
    } catch (error) {
      logError("OPERATIONS", "Challan by token error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Bulk detail for PDF ─────────────────────────────────────
  app.post("/api/operations/challans/bulk-detail", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_challan_management);
      if (!flags) return;
      const raw = req.body.challan_ids;
      if (!Array.isArray(raw) || raw.length === 0) {
        return res.status(400).json({ message: "challan_ids array required" });
      }
      const ids = [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 100);
      if (ids.length === 0) return res.status(400).json({ message: "No valid challan ids" });
      const placeholders = ids.map(() => "?").join(",");
      const [challans] = await db.execute(
        `SELECT c.* FROM challan c
         WHERE c.challan_id IN (${placeholders})`,
        ids
      );
      const byId = new Map(challans.map((c) => [c.challan_id, c]));
      const items = [];
      for (const id of ids) {
        const c = byId.get(id);
        if (!c) continue;
        const [orderRows] = await db.execute(
          `SELECT 
            o.order_id,
            o.customer_id,
            o.booking_name,
            o.shareholder_name,
            o.contact,
            o.alt_contact,
            o.order_type,
            o.cow_number,
            o.hissa_number,
            o.slot,
            o.description,
            o.delivery_status,
            o.rider_id
           FROM orders o
           INNER JOIN challan_orders co ON co.order_id = o.order_id
           WHERE co.challan_id = ? AND ${nonWaqfOrder('o')}
           ORDER BY o.order_id`,
          [id]
        );
        const riderInfo = await resolveSingleRiderFromOrders(db, orderRows);
        items.push({ challan: { ...c, rider_id: riderInfo.rider_id, rider_count: riderInfo.rider_count }, orders: orderRows, rider: riderInfo.rider });
      }
      await writeAuditLog(db, {
        user_id: req.userId, action: "CHALLAN_BULK_DETAIL",
        entity_type: "challan", entity_id: "*",
        new_values: { challan_ids: ids, returned: items.length },
        ip_address: req.ip, user_agent: req.get("user-agent")
      });
      res.json({ items });
    } catch (error) {
      logError("OPERATIONS", "Challan bulk detail error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Status update — patches all linked orders ────────────────
  app.patch("/api/operations/challans/:id/status", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management);
      if (!flags) return;
      const { delivery_status } = req.body;
      if (!ALLOWED_STATUSES.includes(delivery_status)) {
        return res.status(400).json({ message: "Invalid status", allowed: ALLOWED_STATUSES });
      }
      const id = req.params.id;
      const [ex] = await db.execute(`SELECT challan_id FROM challan WHERE challan_id = ?`, [id]);
      if (ex.length === 0) return res.status(404).json({ message: "Challan not found" });
      await db.execute(
        `UPDATE orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         SET o.delivery_status = ?
         WHERE co.challan_id = ?`,
        [delivery_status, id]
      );
      await writeAuditLog(db, {
        user_id: req.userId, action: "CHALLAN_STATUS_UPDATE",
        entity_type: "challan", entity_id: String(id),
        new_values: { delivery_status },
        ip_address: req.ip, user_agent: req.get("user-agent")
      });
      emitOperationsChanged(io, "challans:changed", { action: "status", challan_id: Number(id), delivery_status });
      res.json({ message: "Updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan status error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Rider assignment on a challan: orders.rider_id is the only source of truth ───────────────────────────
  app.patch("/api/operations/challans/:id/rider", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management);
      if (!flags) return;
      const riderId = req.body.rider_id;
      const id = req.params.id;
      const [ex] = await db.execute(`SELECT challan_id FROM challan WHERE challan_id = ?`, [id]);
      if (ex.length === 0) return res.status(404).json({ message: "Challan not found" });

      const nextRiderId = riderId === null || riderId === "" || riderId === undefined ? null : Number(riderId);
      if (nextRiderId !== null) {
        if (!Number.isFinite(nextRiderId) || nextRiderId <= 0) return res.status(400).json({ message: "Invalid rider id" });
        const [rv] = await db.execute(`SELECT rider_id FROM riders WHERE rider_id = ?`, [nextRiderId]);
        if (rv.length === 0) return res.status(400).json({ message: "Rider not found" });
      }

      await db.execute(
        `UPDATE orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         SET o.rider_id = ?
         WHERE co.challan_id = ? AND ${nonWaqfOrder('o')}`,
        [nextRiderId, id]
      );

      if (nextRiderId !== null) {
        await db.execute(
          `UPDATE orders o
           INNER JOIN challan_orders co ON co.order_id = o.order_id
           SET o.delivery_status = 'Rider Assigned'
           WHERE co.challan_id = ? AND o.delivery_status = 'Pending' AND ${nonWaqfOrder('o')}`,
          [id]
        );
      }

      await writeAuditLog(db, {
        user_id: req.userId, action: "CHALLAN_RIDER_UPDATE",
        entity_type: "challan", entity_id: String(id),
        new_values: { rider_id: nextRiderId },
        ip_address: req.ip, user_agent: req.get("user-agent")
      });
      emitOperationsChanged(io, "challans:changed", { action: "rider", challan_id: Number(id), rider_id: nextRiderId });
      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Regenerate challans (creates a new batch, never deletes old) ─
  app.post("/api/operations/challans/regenerate-from-orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_challan_management);
      if (!flags) return;
      const [users] = await db.execute(`SELECT email FROM users WHERE user_id = ?`, [req.userId]);
      const email = (users[0]?.email || "").trim().toLowerCase();
      if (email !== REGENERATE_ALLOWED_EMAIL) {
        return res.status(403).json({ message: "Only the designated operations lead can regenerate challan data." });
      }

      const [orders] = await db.execute(
        `SELECT order_id, order_type, booking_name, shareholder_name, cow_number, hissa_number, contact, alt_contact,
                address, area, day, slot, description, customer_id
         FROM orders
         WHERE booking_date IS NOT NULL AND YEAR(booking_date) = ? AND LOWER(COALESCE(order_type, '')) NOT LIKE '%waqf%'`,
        [OPERATIONS_YEAR]
      );

      const grouped = new Map();
      let skippedNoAddress = 0;
      for (const o of orders) {
        if (classifyHissa(o.order_type) === "waqf") continue;
        if (o.address == null || String(o.address).trim() === "") { skippedNoAddress++; continue; }
        const k = groupKeyForOrder(o);
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k).push(o);
      }

      const [[{ cnt }]] = await db.execute(`SELECT COUNT(*) AS cnt FROM challan_batch`);
      const batchLabel = `Batch ${Number(cnt) + 1} (${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})`;

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        const [batchResult] = await conn.execute(
          `INSERT INTO challan_batch (label, created_at) VALUES (?, NOW())`,
          [batchLabel]
        );
        const batchId = batchResult.insertId;

        const today = new Date();
        const m = String(today.getMonth() + 1).padStart(2, "0");
        const d = String(today.getDate()).padStart(2, "0");
        const challanDate = `${OPERATIONS_YEAR}-${m}-${d}`;

        let created = 0;
        for (const [, list] of grouped.entries()) {
          const first = list[0];
          const qrToken = crypto.randomBytes(24).toString("hex");
          let tp = 0, ts = 0, tw = 0, tg = 0;
          for (const row of list) {
            const c = classifyHissa(row.order_type);
            if (c === "premium") tp++;
            else if (c === "standard") ts++;
            else if (c === "waqf") tw++;
            else if (c === "goat") tg++;
          }
          const totalHissa = tp + ts;
          const bookingNames = [...new Set(list.map((x) => x.booking_name).filter(Boolean))];
          const descParts = [...new Set(list.map((x) => x.description).filter(Boolean))];
          const allSlots = [...new Set(list.map((x) => String(x.slot || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

          const [ins] = await conn.execute(
            `INSERT INTO challan (
               batch_id, qr_token, booking_name, address, area, description, slot, day,
               total_premium_hissa, total_standard_hissa, total_waqf_hissa, total_goat_hissa, total_hissa,
               challan_date
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              batchId, qrToken,
              bookingNames.join(", ") || null,
              normalizeAddr(first.address),
              first.area || null,
              descParts.join("\n") || null,
              allSlots.length ? allSlots.join(", ") : null,
              normalizeDay(first.day) === "_none_" ? null : first.day,
              tp, ts, tw, tg, totalHissa, challanDate
            ]
          );
          const challanId = ins.insertId;
          for (const row of list) {
            await conn.execute(`INSERT INTO challan_orders (challan_id, order_id) VALUES (?, ?)`, [challanId, row.order_id]);
          }
          created++;
        }

        await conn.commit();
        log("OPERATIONS", "Challan regenerate", { by: req.userId, batch_id: batchId, groups: created, skippedNoAddress });
        await writeAuditLog(db, {
          user_id: req.userId, action: "CHALLAN_REGENERATE",
          entity_type: "challan", entity_id: "*",
          new_values: { batch_id: batchId, batch_label: batchLabel, groups: created, skippedNoAddress },
          ip_address: req.ip, user_agent: req.get("user-agent")
        });
        emitOperationsChanged(io, "challans:changed", { action: "regenerated", batch_id: batchId, batch_label: batchLabel, groups: created });
        res.json({ message: "Challan data regenerated", groups: created, skipped_no_address: skippedNoAddress, batch_id: batchId, batch_label: batchLabel });
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (error) {
      logError("OPERATIONS", "Regenerate challan error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Deliveries groups — reads from challan table ─────────────
  app.get("/api/operations/deliveries/groups", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management || f.operation_customer_support);
      if (!flags) return;

      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      if (!batchId) return res.json({ groups: [] });

      // Optional day filter
      const dayFilter = req.query.day ? String(req.query.day).trim() : null;

      let challanSql = `SELECT c.challan_id, c.qr_token, c.booking_name, c.address, c.area,
                c.description, c.slot, c.day, c.challan_date,
                c.total_hissa, c.total_premium_hissa, c.total_standard_hissa, c.total_goat_hissa,
                cb.label AS batch_label
         FROM challan c
         LEFT JOIN challan_batch cb ON cb.batch_id = c.batch_id
         WHERE c.batch_id = ? AND COALESCE(c.total_hissa, 0) > 0`;
      const challanParams = [batchId];

      if (dayFilter) {
        challanSql += ` AND TRIM(COALESCE(c.day, '')) = ?`;
        challanParams.push(dayFilter);
      }
      challanSql += ` ORDER BY c.day, c.slot, c.address, c.challan_id`;

      const [challans] = await db.execute(challanSql, challanParams);

      if (challans.length === 0) return res.json({ groups: [] });

      const challanIds = challans.map((c) => c.challan_id);
      const placeholders = challanIds.map(() => "?").join(",");

      const [orderRows] = await db.execute(
        `SELECT co.challan_id,
                o.order_id, o.customer_id, o.booking_name, o.shareholder_name,
                o.contact, o.alt_contact, o.address, o.area, o.day, o.slot,
                o.order_type, o.cow_number, o.hissa_number, o.description,
                o.delivery_status, o.rider_id
         FROM challan_orders co
         INNER JOIN orders o ON o.order_id = co.order_id
         WHERE co.challan_id IN (${placeholders}) AND ${nonWaqfOrder('o')}
         ORDER BY co.challan_id, o.order_id`,
        challanIds
      );

      const ordersByChallan = new Map();
      for (const o of orderRows) {
        if (!ordersByChallan.has(o.challan_id)) ordersByChallan.set(o.challan_id, []);
        ordersByChallan.get(o.challan_id).push(o);
      }

      const groups = challans.map((c) => {
        const orders = ordersByChallan.get(c.challan_id) || [];

        const shareholderNames = [...new Set(orders.map((x) => x.shareholder_name).filter(Boolean))];
        const bookingNames     = [...new Set(orders.map((x) => x.booking_name).filter(Boolean))];
        const customerIds      = [...new Set(orders.map((x) => x.customer_id).filter(Boolean))];
        const contacts         = [...new Set(orders.map((x) => x.contact).filter(Boolean))];
        const altContacts      = [...new Set(orders.map((x) => x.alt_contact).filter(Boolean))];
        const slots            = [...new Set(orders.map((x) => String(x.slot || "").trim()).filter(Boolean))].sort();
        const riderIds         = uniqueRiderIdsFromOrders(orders);
        const groupRiderId     = riderIds.length === 1 ? riderIds[0] : null;

        const statuses = orders.map((o) => o.delivery_status || "Pending");
        const allDelivered    = statuses.length > 0 && statuses.every((s) => s === "Delivered");
        const anyReturned     = statuses.some((s) => s === "Returned to Farm");
        const anyDispatched   = statuses.some((s) => s === "Dispatched");
        const anyRiderAssigned = statuses.some((s) => s === "Rider Assigned");
        let derivedStatus = "Pending";
        if (allDelivered) derivedStatus = "Delivered";
        else if (anyReturned) derivedStatus = "Returned to Farm";
        else if (anyDispatched) derivedStatus = "Dispatched";
        else if (anyRiderAssigned) derivedStatus = "Rider Assigned";

        return {
          group_key: `${c.challan_id}`,
          challan_id: c.challan_id,
          qr_token: c.qr_token,
          rider_id: groupRiderId,
          rider_count: riderIds.length,
          day: c.day,
          slots,
          slot: c.slot,
          address: c.address,
          area: c.area,
          description: c.description,
          batch_label: c.batch_label,
          hissa_count: Number(c.total_hissa || 0),
          standard_hissa_count: Number(c.total_standard_hissa || 0),
          premium_hissa_count: Number(c.total_premium_hissa || 0),
          goat_hissa_count: Number(c.total_goat_hissa || 0),
          customer_ids: customerIds,
          booking_names: bookingNames,
          contacts,
          alt_contacts: altContacts,
          shareholder_names: shareholderNames,
          derived_status: derivedStatus,
          orders,
          challan: {
            challan_id: c.challan_id,
            qr_token: c.qr_token,
            rider_id: groupRiderId,
          rider_count: riderIds.length,
            address: c.address,
            area: c.area,
            day: c.day,
            slot: c.slot,
            derived_status: derivedStatus,
          },
        };
      });

      res.json({ groups, batch_id: batchId });
    } catch (error) {
      logError("OPERATIONS", "Deliveries groups error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Customer Support: now served by deliveries/groups ────────
  // Kept for backward compat; redirects to groups logic
  app.get("/api/operations/customer-support/orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_customer_support || f.operation_management);
      if (!flags) return;

      let batchId = req.query.batch_id ? Number(req.query.batch_id) : null;
      if (!batchId) batchId = await resolveLatestBatchId(db);
      if (!batchId) return res.json({ orders: [] });

      const { day, status, rider_id, area, order_type, search } = req.query;

      const conditions = ["co.challan_id IS NOT NULL", "c.batch_id = ?", nonWaqfOrder("o")];
      const params = [batchId];

      if (day) { conditions.push("TRIM(COALESCE(o.day, '')) = ?"); params.push(String(day).trim()); }
      if (status) { conditions.push("o.delivery_status = ?"); params.push(String(status).trim()); }
      if (rider_id) { conditions.push("o.rider_id = ?"); params.push(Number(rider_id)); }
      if (area) { conditions.push("TRIM(COALESCE(o.area, '')) = ?"); params.push(String(area).trim()); }
      if (order_type) { conditions.push("o.order_type = ?"); params.push(String(order_type).trim()); }
      if (search) {
        const q = `%${String(search).trim()}%`;
        conditions.push("(o.booking_name LIKE ? OR o.shareholder_name LIKE ? OR o.contact LIKE ? OR o.alt_contact LIKE ? OR o.address LIKE ? OR o.cow_number LIKE ?)");
        params.push(q, q, q, q, q, q);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [orders] = await db.execute(
        `SELECT DISTINCT
           o.order_id, o.booking_name, o.shareholder_name,
           o.contact, o.alt_contact,
           o.address, o.area,
           o.day, o.slot,
           o.order_type, o.cow_number, o.hissa_number, o.description,
           o.rider_id, o.delivery_status,
           c.challan_id, c.qr_token AS challan_token
         FROM orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         INNER JOIN challan c ON c.challan_id = co.challan_id
         ${where}
         ORDER BY o.day, o.slot, o.address, o.order_id`,
        params
      );

      res.json({ orders, batch_id: batchId });
    } catch (error) {
      logError("OPERATIONS", "Customer support orders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── General Dashboard stats ─────────────────────────────────
  app.get("/api/operations/dashboard/stats", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_general_dashboard || f.operation_management);
      if (!flags) return;

      const { day, area, order_type } = req.query;
      const conditions = [];
      const params = [];
      conditions.push("o.booking_date IS NOT NULL");
      conditions.push("YEAR(o.booking_date) = ?");
      params.push(OPERATIONS_YEAR);
      conditions.push(nonWaqfOrder("o"));
      if (day) { conditions.push("TRIM(COALESCE(o.day, '')) = ?"); params.push(String(day).trim()); }
      if (area) { conditions.push("TRIM(COALESCE(o.area, '')) = ?"); params.push(String(area).trim()); }
      if (order_type) { conditions.push("o.order_type = ?"); params.push(String(order_type).trim()); }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [[summary]] = await db.execute(
        `SELECT COUNT(*) AS total_hissas,
                SUM(o.delivery_status = 'Delivered') AS delivered,
                SUM(o.delivery_status = 'Dispatched') AS in_transit,
                SUM(o.delivery_status = 'Pending') AS pending,
                SUM(o.delivery_status = 'Returned to Farm') AS returned,
                SUM(o.delivery_status = 'Rider Assigned') AS rider_assigned,
                SUM(o.rider_id IS NULL) AS unassigned
         FROM orders o ${where}`,
        params
      );
      const [[riderCounts]] = await db.execute(
        `SELECT SUM(availability IN ('Available', 'On Delivery')) AS active_riders FROM riders WHERE status = 'active' OR status IS NULL`
      );
      const [areas] = await db.execute(
        `SELECT COALESCE(NULLIF(TRIM(o.area), ''), 'Unknown') AS area,
                COUNT(*) AS total, SUM(o.delivery_status = 'Delivered') AS delivered,
                SUM(o.delivery_status = 'Pending') AS pending,
                SUM(o.delivery_status = 'Dispatched') AS in_transit,
                SUM(o.delivery_status = 'Returned to Farm') AS returned
         FROM orders o ${where} GROUP BY area ORDER BY area`,
        params
      );
      const riderParams = [...params];
      const riderWhere = conditions.length ? `AND ${conditions.join(" AND ")}` : "";
      const [riderSummary] = await db.execute(
        `SELECT r.rider_id, r.rider_name,
                COALESCE(NULLIF(TRIM(r.availability), ''), 'Available') AS availability,
                SUM(o.delivery_status = 'Delivered') AS delivered,
                SUM(o.delivery_status IN ('Pending', 'Rider Assigned', 'Dispatched')) AS pending
         FROM riders r
         LEFT JOIN orders o ON o.rider_id = r.rider_id ${riderWhere}
         WHERE r.status = 'active' OR r.status IS NULL
         GROUP BY r.rider_id, r.rider_name, r.availability ORDER BY r.rider_name`,
        riderParams
      );
      const activeCount = Number(riderCounts.active_riders || 0);
      const avg = activeCount > 0 ? Math.round((Number(summary.delivered || 0) / activeCount) * 10) / 10 : 0;
      const [typesRows] = await db.execute(
        `SELECT DISTINCT order_type FROM orders WHERE order_type IS NOT NULL AND TRIM(order_type) != '' AND LOWER(COALESCE(order_type, '')) NOT LIKE '%waqf%' ORDER BY order_type`
      );
      res.json({
        total_hissas: Number(summary.total_hissas || 0),
        delivered: Number(summary.delivered || 0),
        in_transit: Number(summary.in_transit || 0),
        pending: Number(summary.pending || 0),
        returned: Number(summary.returned || 0),
        rider_assigned: Number(summary.rider_assigned || 0),
        unassigned: Number(summary.unassigned || 0),
        active_riders: activeCount,
        avg_deliveries_per_rider: avg,
        areas, rider_summary: riderSummary,
        order_types: typesRows.map((r) => r.order_type),
      });
    } catch (error) {
      logError("OPERATIONS", "Dashboard stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── Rider routes ────────────────────────────────────────────
  app.get("/api/operations/riders/details", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const day = req.query.day ? String(req.query.day).trim() : "";
      const [riders] = await db.execute(
        `SELECT r.rider_id, r.rider_name, r.contact, r.vehicle, r.cnic, r.number_plate,
                r.amount_per_delivery, r.total_paid,
                COALESCE(NULLIF(TRIM(r.availability), ''), 'Available') AS availability,
                COALESCE(NULLIF(TRIM(r.status), ''), 'active') AS status
         FROM riders r WHERE r.status = 'active' OR r.status IS NULL ORDER BY r.rider_name`
      );
      const challanParams = [];
      let challanWhere = `WHERE o.rider_id IS NOT NULL AND o.booking_date IS NOT NULL AND YEAR(o.booking_date) = ${OPERATIONS_YEAR} AND ${nonWaqfOrder('o')}`;
      if (day) { challanWhere += ` AND TRIM(COALESCE(c.day, '')) = ?`; challanParams.push(day); }
      const [challanStats] = await db.execute(
        `SELECT o.rider_id,
                COUNT(DISTINCT c.challan_id) AS challan_count,
                SUM(o.delivery_status = 'Delivered') AS delivered_hissa_count,
                COUNT(o.order_id) AS total_assigned_hissa
         FROM challan c
         INNER JOIN challan_orders co ON co.challan_id = c.challan_id
         INNER JOIN orders o ON o.order_id = co.order_id
         ${challanWhere}
         GROUP BY o.rider_id`,
        challanParams
      );
      const statsMap = new Map();
      for (const row of challanStats) statsMap.set(Number(row.rider_id), row);
      const items = riders.map((r) => {
        const s = statsMap.get(Number(r.rider_id)) || {};
        const amountPerDelivery = Number(r.amount_per_delivery || 0);
        const deliveredCount = Number(s.delivered_hissa_count || 0);
        const totalAssigned = Number(s.total_assigned_hissa || 0);
        const totalPaid = Number(r.total_paid || 0);
        const totalAmountMade = deliveredCount * amountPerDelivery;
        return {
          ...r,
          deliveries_completed: deliveredCount,
          total_assigned_hissa: totalAssigned,
          challan_count: Number(s.challan_count || 0),
          total_amount_made: Number(totalAmountMade.toFixed(2)),
          balance_due: Number((totalAmountMade - totalPaid).toFixed(2)),
        };
      });
      res.json({ riders: items });
    } catch (error) {
      logError("OPERATIONS", "Rider details error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/riders/:id/orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) return res.status(400).json({ message: "Invalid rider id" });
      const day = req.query.day ? String(req.query.day).trim() : "";
      const [rv] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, amount_per_delivery, total_paid,
                COALESCE(NULLIF(TRIM(availability), ''), 'Available') AS availability
         FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
        [riderId]
      );
      if (rv.length === 0) return res.status(404).json({ message: "Rider not found" });
      const params = [riderId];
      let sql = `SELECT c.challan_id, c.qr_token, c.day, c.slot, c.address, c.area,
                        o.order_id, o.booking_name, o.shareholder_name, o.contact, o.alt_contact,
                        o.order_type, o.cow_number, o.hissa_number, o.delivery_status
                 FROM challan c
                 INNER JOIN challan_orders co ON co.challan_id = c.challan_id
                 INNER JOIN orders o ON o.order_id = co.order_id
                 WHERE o.rider_id = ? AND o.booking_date IS NOT NULL AND YEAR(o.booking_date) = ${OPERATIONS_YEAR} AND ${nonWaqfOrder('o')}`;
      if (day) { sql += ` AND TRIM(COALESCE(c.day, '')) = ?`; params.push(day); }
      sql += ` ORDER BY c.day, c.slot, c.challan_id, o.order_id`;
      const [rows] = await db.execute(sql, params);
      res.json({ rider: rv[0], orders: rows });
    } catch (error) {
      logError("OPERATIONS", "Rider orders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/riders/:id", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;
      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) return res.status(400).json({ message: "Invalid rider id" });
      const [existing] = await db.execute(
        `SELECT rider_id FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`, [riderId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Rider not found" });
      const updates = [], values = [];
      const { rider_name, contact, vehicle, cnic, number_plate, availability, amount_per_delivery, total_paid } = req.body || {};
      if (rider_name !== undefined) {
        if (!String(rider_name).trim()) return res.status(400).json({ message: "rider_name cannot be empty" });
        updates.push("rider_name = ?"); values.push(String(rider_name).trim());
      }
      if (contact !== undefined) { updates.push("contact = ?"); values.push(contact ? String(contact).trim() : null); }
      if (vehicle !== undefined) { updates.push("vehicle = ?"); values.push(vehicle ? String(vehicle).trim() : null); }
      if (cnic !== undefined) { updates.push("cnic = ?"); values.push(cnic ? String(cnic).trim() : null); }
      if (number_plate !== undefined) { updates.push("number_plate = ?"); values.push(number_plate ? String(number_plate).trim() : null); }
      if (availability !== undefined) { updates.push("availability = ?"); values.push(String(availability || "").trim()); }
      if (amount_per_delivery !== undefined) {
        const n = Number(amount_per_delivery);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "amount_per_delivery must be a valid non-negative number" });
        updates.push("amount_per_delivery = ?"); values.push(n);
      }
      if (total_paid !== undefined) {
        const n = Number(total_paid);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: "total_paid must be a valid non-negative number" });
        updates.push("total_paid = ?"); values.push(n);
      }
      if (updates.length === 0) return res.status(400).json({ message: "No valid fields provided for update" });
      values.push(riderId);
      await db.execute(`UPDATE riders SET ${updates.join(", ")} WHERE rider_id = ?`, values);
      await writeAuditLog(db, {
        user_id: req.userId, action: "RIDER_UPDATE", entity_type: "rider", entity_id: String(riderId),
        new_values: req.body || {}, ip_address: req.ip, user_agent: req.get("user-agent")
      });
      emitOperationsChanged(io, "riders:changed", { action: "updated", rider_id: riderId });
      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Rider update error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/operations/challans/preview-single", verifyToken, async (req, res) => {
    const flags = await assertSub(req, res, (f) => f.operation_challan_management);
    if (!flags) return;
    res.status(501).json({ message: "Not implemented yet." });
  });
  app.post("/api/operations/challans/preview-bulk", verifyToken, async (req, res) => {
    const flags = await assertSub(req, res, (f) => f.operation_challan_management);
    if (!flags) return;
    res.status(501).json({ message: "Not implemented yet." });
  });
};