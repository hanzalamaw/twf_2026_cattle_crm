import crypto from "crypto";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

const ALLOWED_STATUSES = ["Pending", "Rider Assigned", "Dispatched", "Delivered", "Returned to Farm"];
const REGENERATE_ALLOWED_EMAIL = "hanzalamawahab@gmail.com";

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
  return `${normalizeDay(row.day)}${GSEP}${normalizeSlot(row.slot)}${GSEP}${normalizeAddr(row.address)}`;
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

/**
 * @param {object} app
 * @param {import("mysql2/promise").Pool} db
 * @param {Function} verifyToken
 */
export const registerOperationsRoutes = (app, db, verifyToken) => {
  const assertSub = async (req, res, checker) => {
    const flags = await fetchRoleOpsFlags(db, req.userId);
    if (!requireOperationParent(req, res, flags)) return null;
    if (!checker(flags)) {
      res.status(403).json({ message: "Insufficient operations permission" });
      return null;
    }
    return flags;
  };

  // --- Riders (minimal list + create for dropdowns) ---
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
      const { rider_name, contact, vehicle, cnic, number_plate } = req.body;
      if (!rider_name || typeof rider_name !== "string") {
        return res.status(400).json({ message: "rider_name is required" });
      }
      const [result] = await db.execute(
        `INSERT INTO riders (rider_name, contact, vehicle, cnic, number_plate) VALUES (?, ?, ?, ?, ?)`,
        [rider_name.trim(), contact || null, vehicle || null, cnic || null, number_plate || null]
      );
      log("OPERATIONS", "Rider created", { rider_id: result.insertId });
      res.status(201).json({ rider_id: result.insertId });
    } catch (error) {
      logError("OPERATIONS", "Create rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Grouped orders (deliveries view) ---
  app.get("/api/operations/deliveries/groups", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management);
      if (!flags) return;
      const [orders] = await db.execute(
        `SELECT order_id, customer_id, contact, order_type, booking_name, shareholder_name, cow_number, hissa_number,
                alt_contact, address, area, day, slot, description, rider_id
         FROM orders
         ORDER BY day, slot, address, order_id`
      );

      const map = new Map();
      for (const o of orders) {
        const addr = o.address != null && String(o.address).trim() !== "";
        if (!addr) continue;
        const k = groupKeyForOrder(o);
        if (!map.has(k)) {
          map.set(k, {
            group_key: k,
            day: o.day,
            slot: o.slot,
            address: o.address,
            area: o.area,
            orders: []
          });
        }
        map.get(k).orders.push(o);
      }

      const challanByKey = new Map();
      const [challans] = await db.execute(
        `SELECT c.challan_id, c.qr_token, c.rider_id, c.booking_name, c.address, c.area, c.description, c.slot, c.day,
                c.delivery_status, c.total_hissa, c.challan_date,
                c.total_premium_hissa, c.total_standard_hissa, c.total_waqf_hissa, c.total_goat_hissa
         FROM challan c`
      );
      for (const c of challans) {
        const k = `${normalizeDay(c.day)}${GSEP}${normalizeSlot(c.slot)}${GSEP}${normalizeAddr(c.address)}`;
        challanByKey.set(k, c);
      }

      const groups = [];
      for (const g of map.values()) {
        const k = groupKeyForOrder({
          day: g.day,
          slot: g.slot,
          address: g.address
        });
        const shareholderNames = [...new Set(g.orders.map((x) => x.shareholder_name).filter(Boolean))];
        const hissaCount = g.orders.length;
        groups.push({
          ...g,
          hissa_count: hissaCount,
          shareholder_names: shareholderNames,
          challan: challanByKey.get(k) || null
        });
      }

      groups.sort((a, b) => String(a.day).localeCompare(String(b.day)) || String(a.slot).localeCompare(String(b.slot)));
      res.json({ groups });
    } catch (error) {
      logError("OPERATIONS", "Deliveries groups error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Challan detail ---
  app.get("/api/operations/challans/by-token/:token", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management);
      if (!flags) return;
      const token = String(req.params.token || "").trim();
      if (!token) return res.status(400).json({ message: "Invalid token" });
      const [ch] = await db.execute(`SELECT * FROM challan WHERE qr_token = ?`, [token]);
      if (ch.length === 0) return res.status(404).json({ message: "Challan not found" });
      const challan = ch[0];
      const [orderRows] = await db.execute(
        `SELECT o.* FROM orders o
         INNER JOIN challan_orders co ON co.order_id = o.order_id
         WHERE co.challan_id = ?
         ORDER BY o.order_id`,
        [challan.challan_id]
      );
      let rider = null;
      if (challan.rider_id) {
        const [rs] = await db.execute(`SELECT rider_id, rider_name, contact FROM riders WHERE rider_id = ?`, [challan.rider_id]);
        rider = rs[0] || null;
      }
      res.json({ challan, orders: orderRows, rider });
    } catch (error) {
      logError("OPERATIONS", "Challan by token error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/operations/challans", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_challan_management || f.operation_deliveries_management);
      if (!flags) return;
      const [rows] = await db.execute(
        `SELECT c.*, r.rider_name,
          (SELECT COUNT(*) FROM challan_orders co WHERE co.challan_id = c.challan_id) AS order_count,
          (SELECT GROUP_CONCAT(DISTINCT NULLIF(TRIM(o.shareholder_name), '') ORDER BY o.order_id SEPARATOR ', ')
           FROM challan_orders co2 INNER JOIN orders o ON o.order_id = co2.order_id WHERE co2.challan_id = c.challan_id) AS shareholders_csv
         FROM challan c
         LEFT JOIN riders r ON c.rider_id = r.rider_id
         ORDER BY c.day, c.slot, c.challan_id`
      );
      res.json({ challans: rows });
    } catch (error) {
      logError("OPERATIONS", "List challans error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

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
        `SELECT c.*, r.rider_name, r.contact AS rider_contact FROM challan c
         LEFT JOIN riders r ON c.rider_id = r.rider_id
         WHERE c.challan_id IN (${placeholders})`,
        ids
      );
      const byId = new Map(challans.map((c) => [c.challan_id, c]));
      const items = [];
      for (const id of ids) {
        const c = byId.get(id);
        if (!c) continue;
        const [orderRows] = await db.execute(
          `SELECT o.* FROM orders o
           INNER JOIN challan_orders co ON co.order_id = o.order_id
           WHERE co.challan_id = ?
           ORDER BY o.order_id`,
          [id]
        );
        let rider = null;
        if (c.rider_id) {
          rider = { rider_id: c.rider_id, rider_name: c.rider_name, contact: c.rider_contact };
        }
        items.push({ challan: c, orders: orderRows, rider });
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CHALLAN_BULK_DETAIL",
        entity_type: "challan",
        entity_id: "*",
        new_values: { challan_ids: ids, returned: items.length },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
      res.json({ items });
    } catch (error) {
      logError("OPERATIONS", "Challan bulk detail error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

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
      await db.execute(`UPDATE challan SET delivery_status = ? WHERE challan_id = ?`, [delivery_status, id]);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CHALLAN_STATUS_UPDATE",
        entity_type: "challan",
        entity_id: String(id),
        new_values: { delivery_status },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
      res.json({ message: "Updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan status error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.patch("/api/operations/challans/:id/rider", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_deliveries_management || f.operation_challan_management);
      if (!flags) return;
      const riderId = req.body.rider_id;
      const id = req.params.id;
      const [ex] = await db.execute(`SELECT challan_id FROM challan WHERE challan_id = ?`, [id]);
      if (ex.length === 0) return res.status(404).json({ message: "Challan not found" });
      if (riderId === null || riderId === "" || riderId === undefined) {
        await db.execute(`UPDATE challan SET rider_id = NULL WHERE challan_id = ?`, [id]);
      } else {
        const [rv] = await db.execute(`SELECT rider_id FROM riders WHERE rider_id = ?`, [riderId]);
        if (rv.length === 0) return res.status(400).json({ message: "Rider not found" });
        await db.execute(`UPDATE challan SET rider_id = ? WHERE challan_id = ?`, [riderId, id]);
      }
      const [orderIds] = await db.execute(`SELECT order_id FROM challan_orders WHERE challan_id = ?`, [id]);
      for (const row of orderIds) {
        if (riderId === null || riderId === "" || riderId === undefined) {
          await db.execute(`UPDATE orders SET rider_id = NULL WHERE order_id = ?`, [row.order_id]);
        } else {
          await db.execute(`UPDATE orders SET rider_id = ? WHERE order_id = ?`, [riderId, row.order_id]);
        }
      }
      if (riderId && ALLOWED_STATUSES.includes("Rider Assigned")) {
        await db.execute(`UPDATE challan SET delivery_status = CASE WHEN delivery_status = 'Pending' THEN 'Rider Assigned' ELSE delivery_status END WHERE challan_id = ?`, [id]);
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CHALLAN_RIDER_UPDATE",
        entity_type: "challan",
        entity_id: String(id),
        new_values: { rider_id: riderId === "" || riderId === undefined ? null : riderId },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Challan rider error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Regenerate challan table from orders (authorized email only) ---
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
                address, area, day, slot, description
         FROM orders`
      );

      const grouped = new Map();
      let skippedNoAddress = 0;
      for (const o of orders) {
        if (o.address == null || String(o.address).trim() === "") {
          skippedNoAddress++;
          continue;
        }
        const k = groupKeyForOrder(o);
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k).push(o);
      }

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute("DELETE FROM challan_orders");
        await conn.execute("DELETE FROM challan");

        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, "0");
        const d = String(today.getDate()).padStart(2, "0");
        const challanDate = `${y}-${m}-${d}`;

        let created = 0;
        for (const [, list] of grouped.entries()) {
          const first = list[0];
          const qrToken = crypto.randomBytes(24).toString("hex");
          let tp = 0,
            ts = 0,
            tw = 0,
            tg = 0;
          for (const row of list) {
            const c = classifyHissa(row.order_type);
            if (c === "premium") tp++;
            else if (c === "standard") ts++;
            else if (c === "waqf") tw++;
            else if (c === "goat") tg++;
          }
          const totalHissa = list.length;
          const bookingNames = [...new Set(list.map((x) => x.booking_name).filter(Boolean))];
          const descParts = [...new Set(list.map((x) => x.description).filter(Boolean))];

          const [ins] = await conn.execute(
            `INSERT INTO challan (
               qr_token, rider_id, booking_name, address, area, description, slot, day,
               total_premium_hissa, total_standard_hissa, total_waqf_hissa, total_goat_hissa, total_hissa,
               delivery_status, challan_date
             ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
            [
              qrToken,
              bookingNames.join(", ") || null,
              first.address,
              first.area || null,
              descParts.join("\n") || null,
              normalizeSlot(first.slot) === "_none_" ? null : first.slot,
              normalizeDay(first.day) === "_none_" ? null : first.day,
              tp,
              ts,
              tw,
              tg,
              totalHissa,
              challanDate
            ]
          );
          const challanId = ins.insertId;
          for (const row of list) {
            await conn.execute(`INSERT INTO challan_orders (challan_id, order_id) VALUES (?, ?)`, [challanId, row.order_id]);
          }
          created++;
        }

        await conn.commit();
        log("OPERATIONS", "Challan regenerate", { by: req.userId, groups: created, skippedNoAddress });
        await writeAuditLog(db, {
          user_id: req.userId,
          action: "CHALLAN_REGENERATE",
          entity_type: "challan",
          entity_id: "*",
          new_values: { groups: created, skippedNoAddress },
          ip_address: req.ip,
          user_agent: req.get("user-agent")
        });
        res.json({ message: "Challan data regenerated", groups: created, skipped_no_address: skippedNoAddress });
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

  // --- Placeholder endpoints for PDF flows (extend later) ---
  app.post("/api/operations/challans/preview-single", verifyToken, async (req, res) => {
    const flags = await assertSub(req, res, (f) => f.operation_challan_management);
    if (!flags) return;
    res.status(501).json({ message: "Single / selected challan PDF generation is not implemented yet." });
  });

  app.post("/api/operations/challans/preview-bulk", verifyToken, async (req, res) => {
    const flags = await assertSub(req, res, (f) => f.operation_challan_management);
    if (!flags) return;
    res.status(501).json({ message: "Bulk challan PDF generation is not implemented yet." });
  });
};
