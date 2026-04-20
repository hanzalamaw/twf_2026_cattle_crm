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

      const {
        rider_name,
        contact,
        vehicle,
        cnic,
        number_plate,
        amount_per_delivery
      } = req.body;

      if (!rider_name || typeof rider_name !== "string") {
        return res.status(400).json({ message: "rider_name is required" });
      }

      const amount = amount_per_delivery == null || amount_per_delivery === ""
        ? 0
        : Number(amount_per_delivery);

      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: "amount_per_delivery must be a valid non-negative number" });
      }

      const [result] = await db.execute(
        `INSERT INTO riders
          (rider_name, contact, vehicle, cnic, number_plate, amount_per_delivery, total_paid, availability, status)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'Available', 'active')`,
        [
          rider_name.trim(),
          contact || null,
          vehicle || null,
          cnic || null,
          number_plate || null,
          amount
        ]
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


  // --- Rider detailed list for Rider Management screen ---
  app.get("/api/operations/riders/details", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;

      const day = req.query.day ? String(req.query.day).trim() : "";

      const riderParams = [];
      let riderSql = `
        SELECT
          r.rider_id,
          r.rider_name,
          r.contact,
          r.vehicle,
          r.cnic,
          r.number_plate,
          r.amount_per_delivery,
          r.total_paid,
          COALESCE(NULLIF(TRIM(r.availability), ''), 'Available') AS availability,
          COALESCE(NULLIF(TRIM(r.status), ''), 'active') AS status
        FROM riders r
        WHERE r.status = 'active' OR r.status IS NULL
        ORDER BY r.rider_name
      `;

      const [riders] = await db.execute(riderSql, riderParams);

      const challanParams = [];
      let challanWhere = `WHERE c.rider_id IS NOT NULL`;
      if (day) {
        challanWhere += ` AND TRIM(COALESCE(c.day, '')) = ?`;
        challanParams.push(day);
      }

      const [challanStats] = await db.execute(
        `
        SELECT
          c.rider_id,
          COUNT(DISTINCT c.challan_id) AS challan_count,
          SUM(CASE WHEN c.delivery_status = 'Delivered' THEN COALESCE(c.total_hissa, 0) ELSE 0 END) AS delivered_hissa_count,
          SUM(CASE WHEN c.delivery_status IN ('Pending', 'Rider Assigned', 'Dispatched') THEN COALESCE(c.total_hissa, 0) ELSE 0 END) AS pending_hissa_count,
          SUM(COALESCE(c.total_hissa, 0)) AS total_assigned_hissa
        FROM challan c
        ${challanWhere}
        GROUP BY c.rider_id
        `,
        challanParams
      );

      const statsMap = new Map();
      for (const row of challanStats) {
        statsMap.set(Number(row.rider_id), row);
      }

      const items = riders.map((r) => {
        const s = statsMap.get(Number(r.rider_id)) || {};
        const amountPerDelivery = Number(r.amount_per_delivery || 0);
        const deliveredCount = Number(s.delivered_hissa_count || 0);
        const pendingCount = Number(s.pending_hissa_count || 0);
        const totalAssigned = Number(s.total_assigned_hissa || 0);
        const totalPaid = Number(r.total_paid || 0);
        const totalAmountMade = deliveredCount * amountPerDelivery;

        return {
          ...r,
          deliveries_completed: deliveredCount,
          pending_deliveries: pendingCount,
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

  // --- Rider assigned orders / challans detail ---
  app.get("/api/operations/riders/:id/orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;

      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) {
        return res.status(400).json({ message: "Invalid rider id" });
      }

      const day = req.query.day ? String(req.query.day).trim() : "";

      const [rv] = await db.execute(
        `SELECT rider_id, rider_name, contact, vehicle, number_plate, amount_per_delivery, total_paid,
                COALESCE(NULLIF(TRIM(availability), ''), 'Available') AS availability
         FROM riders
         WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
        [riderId]
      );
      if (rv.length === 0) return res.status(404).json({ message: "Rider not found" });

      const params = [riderId];
      let sql = `
        SELECT
          c.challan_id,
          c.qr_token,
          c.day,
          c.slot,
          c.address,
          c.area,
          c.delivery_status,
          o.order_id,
          o.booking_name,
          o.shareholder_name,
          o.contact,
          o.alt_contact,
          o.order_type,
          o.cow_number,
          o.hissa_number
        FROM challan c
        INNER JOIN challan_orders co ON co.challan_id = c.challan_id
        INNER JOIN orders o ON o.order_id = co.order_id
        WHERE c.rider_id = ?
      `;
      if (day) {
        sql += ` AND TRIM(COALESCE(c.day, '')) = ?`;
        params.push(day);
      }
      sql += ` ORDER BY c.day, c.slot, c.challan_id, o.order_id`;

      const [rows] = await db.execute(sql, params);

      res.json({
        rider: rv[0],
        orders: rows
      });
    } catch (error) {
      logError("OPERATIONS", "Rider orders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Update rider info / status / payments ---
  app.patch("/api/operations/riders/:id", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_rider_management);
      if (!flags) return;

      const riderId = Number(req.params.id);
      if (!Number.isFinite(riderId) || riderId <= 0) {
        return res.status(400).json({ message: "Invalid rider id" });
      }

      const [existing] = await db.execute(
        `SELECT rider_id FROM riders WHERE rider_id = ? AND (status = 'active' OR status IS NULL)`,
        [riderId]
      );
      if (existing.length === 0) {
        return res.status(404).json({ message: "Rider not found" });
      }

      const updates = [];
      const values = [];

      const {
        rider_name,
        contact,
        vehicle,
        cnic,
        number_plate,
        availability,
        amount_per_delivery,
        total_paid
      } = req.body || {};

      if (rider_name !== undefined) {
        if (!String(rider_name).trim()) {
          return res.status(400).json({ message: "rider_name cannot be empty" });
        }
        updates.push("rider_name = ?");
        values.push(String(rider_name).trim());
      }

      if (contact !== undefined) {
        updates.push("contact = ?");
        values.push(contact ? String(contact).trim() : null);
      }

      if (vehicle !== undefined) {
        updates.push("vehicle = ?");
        values.push(vehicle ? String(vehicle).trim() : null);
      }

      if (cnic !== undefined) {
        updates.push("cnic = ?");
        values.push(cnic ? String(cnic).trim() : null);
      }

      if (number_plate !== undefined) {
        updates.push("number_plate = ?");
        values.push(number_plate ? String(number_plate).trim() : null);
      }

      if (availability !== undefined) {
        const nextAvailability = String(availability || "").trim();
        if (!RIDER_AVAILABILITY_STATUSES.includes(nextAvailability)) {
          return res.status(400).json({
            message: "Invalid rider availability",
            allowed: RIDER_AVAILABILITY_STATUSES
          });
        }
        updates.push("availability = ?");
        values.push(nextAvailability);
      }

      if (amount_per_delivery !== undefined) {
        const n = Number(amount_per_delivery);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ message: "amount_per_delivery must be a valid non-negative number" });
        }
        updates.push("amount_per_delivery = ?");
        values.push(n);
      }

      if (total_paid !== undefined) {
        const n = Number(total_paid);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ message: "total_paid must be a valid non-negative number" });
        }
        updates.push("total_paid = ?");
        values.push(n);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No valid fields provided for update" });
      }

      values.push(riderId);

      await db.execute(
        `UPDATE riders SET ${updates.join(", ")} WHERE rider_id = ?`,
        values
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "RIDER_UPDATE",
        entity_type: "rider",
        entity_id: String(riderId),
        new_values: req.body || {},
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });

      res.json({ message: "Rider updated" });
    } catch (error) {
      logError("OPERATIONS", "Rider update error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

// ─────────────────────────────────────────────────────────────
// ADD THESE TWO ROUTE BLOCKS INSIDE registerOperationsRoutes()
// Place them before the closing }; of the exported function
// ─────────────────────────────────────────────────────────────

  // ── Customer Support: filtered orders list ─────────────────
  app.get("/api/operations/customer-support/orders", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_customer_support || f.operation_management);
      if (!flags) return;

      const { day, status, rider_id, area, order_type, search } = req.query;

      const conditions = [];
      const params = [];

      if (day) {
        conditions.push("TRIM(COALESCE(o.day, '')) = ?");
        params.push(String(day).trim());
      }
      if (status) {
        conditions.push("o.delivery_status = ?");
        params.push(String(status).trim());
      }
      if (rider_id) {
        conditions.push("o.rider_id = ?");
        params.push(Number(rider_id));
      }
      if (area) {
        conditions.push("TRIM(COALESCE(o.area, '')) = ?");
        params.push(String(area).trim());
      }
      if (order_type) {
        conditions.push("o.order_type = ?");
        params.push(String(order_type).trim());
      }
      if (search) {
        const q = `%${String(search).trim()}%`;
        conditions.push(
          "(o.booking_name LIKE ? OR o.shareholder_name LIKE ? OR o.contact LIKE ? OR o.alt_contact LIKE ? OR o.address LIKE ? OR o.cow_number LIKE ?)"
        );
        params.push(q, q, q, q, q, q);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [orders] = await db.execute(
        `SELECT
           o.order_id, o.booking_name, o.shareholder_name,
           o.contact, o.alt_contact,
           o.address, o.area,
           o.day, o.slot,
           o.order_type, o.cow_number, o.hissa_number,
           o.rider_id, o.delivery_status
         FROM orders o
         ${where}
         ORDER BY o.day, o.slot, o.address, o.order_id`,
        params
      );

      res.json({ orders });
    } catch (error) {
      logError("OPERATIONS", "Customer support orders error", error);
      res.status(500).json({ message: "Server error" });
    }
  });


  // ── General Dashboard: aggregated stats ────────────────────
  app.get("/api/operations/dashboard/stats", verifyToken, async (req, res) => {
    try {
      const flags = await assertSub(req, res, (f) => f.operation_general_dashboard || f.operation_management);
      if (!flags) return;

      const { day, area, order_type } = req.query;

      const conditions = [];
      const params = [];

      if (day) {
        conditions.push("TRIM(COALESCE(o.day, '')) = ?");
        params.push(String(day).trim());
      }
      if (area) {
        conditions.push("TRIM(COALESCE(o.area, '')) = ?");
        params.push(String(area).trim());
      }
      if (order_type) {
        conditions.push("o.order_type = ?");
        params.push(String(order_type).trim());
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      // ── Overall stat counts ──
      const [[summary]] = await db.execute(
        `SELECT
           COUNT(*)                                                              AS total_hissas,
           SUM(o.delivery_status = 'Delivered')                                 AS delivered,
           SUM(o.delivery_status = 'Dispatched')                                AS in_transit,
           SUM(o.delivery_status = 'Pending')                                   AS pending,
           SUM(o.delivery_status = 'Returned to Farm')                          AS returned,
           SUM(o.delivery_status = 'Rider Assigned')                            AS rider_assigned,
           SUM(o.rider_id IS NULL)                                               AS unassigned
         FROM orders o ${where}`,
        params
      );

      // ── Active riders (not filtered by day/area/type — riders are global) ──
      const [[riderCounts]] = await db.execute(
        `SELECT
           SUM(availability IN ('Available', 'On Delivery')) AS active_riders
         FROM riders
         WHERE status = 'active' OR status IS NULL`
      );

      // ── Area breakdown ──
      const [areas] = await db.execute(
        `SELECT
           COALESCE(NULLIF(TRIM(o.area), ''), 'Unknown') AS area,
           COUNT(*)                                        AS total,
           SUM(o.delivery_status = 'Delivered')            AS delivered,
           SUM(o.delivery_status = 'Pending')              AS pending,
           SUM(o.delivery_status = 'Dispatched')           AS in_transit,
           SUM(o.delivery_status = 'Returned to Farm')     AS returned
         FROM orders o ${where}
         GROUP BY area
         ORDER BY area`,
        params
      );

      // ── Per-rider summary ──
      const riderParams = [...params];
      const riderWhere  = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

      const [riderSummary] = await db.execute(
        `SELECT
           r.rider_id, r.rider_name,
           COALESCE(NULLIF(TRIM(r.availability), ''), 'Available') AS availability,
           SUM(o.delivery_status = 'Delivered')   AS delivered,
           SUM(o.delivery_status IN ('Pending', 'Rider Assigned', 'Dispatched')) AS pending
         FROM riders r
         LEFT JOIN orders o ON o.rider_id = r.rider_id ${riderWhere}
         WHERE r.status = 'active' OR r.status IS NULL
         GROUP BY r.rider_id, r.rider_name, r.availability
         ORDER BY r.rider_name`,
        riderParams
      );

      // ── Avg deliveries per active rider ──
      const activeCount = Number(riderCounts.active_riders || 0);
      const totalDelivered = Number(summary.delivered || 0);
      const avg = activeCount > 0 ? Math.round((totalDelivered / activeCount) * 10) / 10 : 0;

      // ── Unique order types (for filter dropdown) ──
      const [typesRows] = await db.execute(
        `SELECT DISTINCT order_type FROM orders WHERE order_type IS NOT NULL AND TRIM(order_type) != '' ORDER BY order_type`
      );

      res.json({
        total_hissas:             Number(summary.total_hissas   || 0),
        delivered:                Number(summary.delivered      || 0),
        in_transit:               Number(summary.in_transit     || 0),
        pending:                  Number(summary.pending        || 0),
        returned:                 Number(summary.returned       || 0),
        rider_assigned:           Number(summary.rider_assigned || 0),
        unassigned:               Number(summary.unassigned     || 0),
        active_riders:            activeCount,
        avg_deliveries_per_rider: avg,
        areas,
        rider_summary: riderSummary,
        order_types: typesRows.map(r => r.order_type),
      });
    } catch (error) {
      logError("OPERATIONS", "Dashboard stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

};