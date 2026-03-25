import PDFDocument from "pdfkit";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { limitOffsetClause } from "../utils/sqlPagination.js";

/** Normalize to date-only YYYY-MM-DD for consistent display and audit (avoids timezone shift). */
function toDateOnly(v) {
  if (v == null || v === "") return v;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : s;
}

/**
 * Booking management API: orders list with search and filters.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 * @param {Function} verifyToken - auth middleware
 */
export const registerBookingRoutes = (app, db, verifyToken) => {
  // Generate customer ID based on contact lookup
  app.post("/api/booking/generate-customer-id", verifyToken, async (req, res) => {
    try {
      const { contact } = req.body || {};
      if (!contact || String(contact).trim().length < 3) {
        return res.status(400).json({ message: "Contact number is required (minimum 3 characters)" });
      }
      const contactStr = String(contact).trim();

      // Check existing orders for this contact
      const [orderRows] = await db.execute(
        "SELECT customer_id FROM orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (orderRows.length > 0 && orderRows[0].customer_id) {
        log("BOOKING", "Customer ID found in orders", { user_id: req.userId, contact: contactStr, customer_id: orderRows[0].customer_id });
        return res.json({ customer_id: orderRows[0].customer_id });
      }

      // Check cancelled orders for this contact
      const [cancelledRows] = await db.execute(
        "SELECT customer_id FROM cancelled_orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (cancelledRows.length > 0 && cancelledRows[0].customer_id) {
        log("BOOKING", "Customer ID found in cancelled orders", { user_id: req.userId, contact: contactStr, customer_id: cancelledRows[0].customer_id });
        return res.json({ customer_id: cancelledRows[0].customer_id });
      }

      // Generate new customer ID: TWF-XXXX-Q format
      // Find max numeric part from both orders and cancelled_orders
      const [maxOrderRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM orders WHERE customer_id LIKE 'TWF-%'"
      );
      const [maxCancelledRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM cancelled_orders WHERE customer_id LIKE 'TWF-%'"
      );

      const maxOrderNum = Number(maxOrderRows[0]?.maxNum || 0);
      const maxCancelledNum = Number(maxCancelledRows[0]?.maxNum || 0);
      const nextNum = Math.max(maxOrderNum, maxCancelledNum) + 1;
      const customerId = `TWF-${String(nextNum).padStart(4, "0")}-Q`;

      log("BOOKING", "Customer ID generated", { user_id: req.userId, contact: contactStr, customer_id: customerId });
      res.json({ customer_id: customerId });
    } catch (error) {
      logError("BOOKING", "Generate customer ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Generate order ID based on order_type
  app.post("/api/booking/generate-order-id", verifyToken, async (req, res) => {
    try {
      const { order_type } = req.body || {};
      if (!order_type || !String(order_type).trim()) {
        return res.status(400).json({ message: "Order type is required" });
      }

      const orderType = String(order_type).trim();
      const year = 2026;

      // Map order types to prefixes
      const prefixMap = {
        "Cow": "C",
        "Goat (Hissa)": "G",
        "Hissa - Standard": "S",
        "Hissa - Premium": "P",
        "Hissa - Waqf": "W",
        "Goat": "G",
      };

      const prefix = prefixMap[orderType] || "O"; // Default to "O" if not found

      // Find next available number for this prefix and year
      // Check orders with booking_date in the year OR orders with null booking_date (new orders)
      // Handle both old format (#O-0001-2026) and new format (C-0001-2026)
      const pattern1 = `${prefix}-%`; // New format: C-0001-2026
      
      // Try to find max from new format first
      const [idRows1] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(order_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS nextId FROM orders WHERE order_id LIKE ? AND (YEAR(booking_date) = ? OR booking_date IS NULL)",
        [pattern1, year]
      );
      
      // Also check old format if prefix is O (for backward compatibility)
      let maxFromOld = 0;
      if (prefix === "O") {
        const [idRows2] = await db.execute(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(order_id, 4, 4) AS UNSIGNED)), 0) AS nextId FROM orders WHERE order_id LIKE '#O-%' AND (YEAR(booking_date) = ? OR booking_date IS NULL)",
          [year]
        );
        maxFromOld = Number(idRows2[0]?.nextId || 0);
      }
      
      const maxFromNew = Number(idRows1[0]?.nextId || 0);
      const nextNum = Math.max(maxFromNew, maxFromOld, 0) + 1;
      const orderId = `${prefix}-${String(nextNum).padStart(4, "0")}-${year}`;

      log("BOOKING", "Order ID generated", { user_id: req.userId, order_type: orderType, order_id: orderId });
      res.json({ order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Generate order ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get available cow/hissa number (day-based independent numbering)
  app.post("/api/booking/get-available-cow-hissa", verifyToken, async (req, res) => {
    try {
      const { order_type, day, booking_date } = req.body || {};
      if (!order_type || !String(order_type).trim()) {
        return res.json({ cow_number: "", hissa_number: "" });
      }

      const orderType = String(order_type).trim();
      const dayValue = day ? String(day).trim() : null;
      const year = booking_date ? (new Date(booking_date).getFullYear() || 2026) : 2026;

      // Only for Hissa types
      const hissaTypes = ["Hissa - Standard", "Hissa - Premium", "Hissa - Waqf", "Goat (Hissa)"];
      if (!hissaTypes.includes(orderType)) {
        return res.json({ cow_number: "", hissa_number: "" });
      }

      // Get all used cow/hissa combinations for this order_type, day, and year
      let usedCombinations = [];
      if (dayValue) {
        const [usedRows] = await db.execute(
          "SELECT cow_number, hissa_number FROM orders WHERE order_type = ? AND day = ? AND (YEAR(booking_date) = ? OR booking_date IS NULL) AND cow_number IS NOT NULL AND hissa_number IS NOT NULL",
          [orderType, dayValue, year]
        );
        usedCombinations = usedRows.map((r) => ({ cow: r.cow_number, hissa: r.hissa_number }));
      } else {
        const [usedRows] = await db.execute(
          "SELECT cow_number, hissa_number FROM orders WHERE order_type = ? AND (YEAR(booking_date) = ? OR booking_date IS NULL) AND cow_number IS NOT NULL AND hissa_number IS NOT NULL",
          [orderType, year]
        );
        usedCombinations = usedRows.map((r) => ({ cow: r.cow_number, hissa: r.hissa_number }));
      }

      // Find first available combination
      // Cows: S1, S2, S3, ... (Standard)
      // Premium: P1, P2, P3, ... (Premium)
      // Waqf: W1, W2, W3, ... (Waqf)
      // Hissas: 1-7 per cow
      const prefixMap = {
        "Hissa - Premium": "P",
        "Hissa - Standard": "S",
        "Hissa - Waqf": "W",
      };
      
      const cowPrefix = prefixMap[orderType] || "";
      const maxCows = 50; // Reasonable limit
      const maxHissas = 7;

      let foundCow = "";
      let foundHissa = "";

      for (let cowNum = 1; cowNum <= maxCows; cowNum++) {
        const cowId = `${cowPrefix}${cowNum}`;
        for (let hissaNum = 1; hissaNum <= maxHissas; hissaNum++) {
          const isUsed = usedCombinations.some((uc) => uc.cow === cowId && uc.hissa === String(hissaNum));
          if (!isUsed) {
            foundCow = cowId;
            foundHissa = String(hissaNum);
            break;
          }
        }
        if (foundCow) break;
      }

      log("BOOKING", "Available cow/hissa retrieved", {
        user_id: req.userId,
        order_type: orderType,
        day: dayValue,
        cow_number: foundCow,
        hissa_number: foundHissa,
      });
      res.json({ cow_number: foundCow, hissa_number: foundHissa });
    } catch (error) {
      logError("BOOKING", "Get available cow/hissa error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Hissa stats sheet (for /stats page)
  // Returns totals per cow/day/type (distinct hissa_number) and slot distribution (for row coloring).
  app.get("/api/booking/hissa-sheet", verifyToken, async (req, res) => {
    try {
      const yearParam = parseInt(req.query.year, 10);
      const year = Number.isFinite(yearParam) ? yearParam : 2026;
      const days = ["DAY 1", "DAY 2", "DAY 3"];
      const orderTypes = ["Hissa - Standard", "Hissa - Premium", "Hissa - Waqf"];

      const [rows] = await db.execute(
        `
        SELECT
          o.order_type,
          o.day,
          o.cow_number,
          o.slot,
          COUNT(DISTINCT o.hissa_number) AS total_hissa
        FROM orders o
        WHERE o.order_type IN (${orderTypes.map(() => "?").join(",")})
          AND o.day IN (${days.map(() => "?").join(",")})
          AND o.cow_number IS NOT NULL AND o.cow_number <> ''
          AND o.hissa_number IS NOT NULL AND o.hissa_number <> ''
          AND YEAR(o.booking_date) = ?
        GROUP BY o.order_type, o.day, o.cow_number, o.slot
        `,
        [...orderTypes, ...days, year]
      );

      const out = { year, days, order_types: orderTypes, types: {} };

      for (const ot of orderTypes) {
        out.types[ot] = {};
        for (const d of days) out.types[ot][d] = {};
      }

      const slotOrder = ["SLOT 1", "SLOT 2", "SLOT 3"];
      const normalizeSlot = (slot) => {
        const s = String(slot || "").trim();
        if (slotOrder.includes(s)) return s;
        return null;
      };

      for (const r of rows) {
        const ot = String(r.order_type || "").trim();
        const d = String(r.day || "").trim();
        const cow = String(r.cow_number || "").trim();
        const slot = normalizeSlot(r.slot);
        const count = Math.max(0, Number(r.total_hissa) || 0);

        if (!out.types[ot] || !out.types[ot][d] || !cow) continue;

        if (!out.types[ot][d][cow]) {
          out.types[ot][d][cow] = {
            total_hissa: 0,
            slot_counts: { "SLOT 1": 0, "SLOT 2": 0, "SLOT 3": 0 },
          };
        }
        out.types[ot][d][cow].total_hissa += count;
        if (slot) out.types[ot][d][cow].slot_counts[slot] += count;
      }

      res.json(out);
    } catch (error) {
      logError("BOOKING", "Hissa sheet stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Check if cow/hissa combination already exists
  app.post("/api/booking/check-cow-hissa", verifyToken, async (req, res) => {
    try {
      const { cow_number, hissa_number, order_type, day, order_id, booking_date } = req.body || {};
      
      if (!cow_number || !hissa_number || !order_type) {
        return res.json({ exists: false });
      }

      const cowNum = String(cow_number).trim();
      const hissaNum = String(hissa_number).trim();
      const orderType = String(order_type).trim();
      const dayValue = day ? String(day).trim() : null;
      const year = booking_date ? (new Date(booking_date).getFullYear() || 2026) : 2026;

      let query = `
        SELECT order_id, booking_name, shareholder_name, contact 
        FROM orders 
        WHERE cow_number = ? AND hissa_number = ? AND order_type = ?
        AND (YEAR(booking_date) = ? OR booking_date IS NULL)
      `;
      const params = [cowNum, hissaNum, orderType, year];

      if (dayValue) {
        query += " AND day = ?";
        params.push(dayValue);
      }

      // Exclude current order_id if editing
      if (order_id) {
        query += " AND order_id != ?";
        params.push(order_id);
      }

      const [rows] = await db.execute(query, params);
      
      if (rows.length > 0) {
        const existing = rows[0];
        return res.json({
          exists: true,
          order_id: existing.order_id,
          booking_name: existing.booking_name,
          shareholder_name: existing.shareholder_name,
          contact: existing.contact,
        });
      }

      res.json({ exists: false });
    } catch (error) {
      logError("BOOKING", "Check cow/hissa error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Create new order
  app.post("/api/booking/orders", verifyToken, async (req, res) => {
    try {
      const body = req.body || {};
      const {
        order_id,
        customer_id,
        contact,
        order_type,
        booking_name,
        shareholder_name,
        cow_number,
        hissa_number,
        alt_contact,
        address,
        area,
        day,
        booking_date,
        total_amount,
        order_source,
        reference,
        description,
        slot,
      } = body;

      // Validation
      if (!order_id || !String(order_id).trim()) {
        return res.status(400).json({ message: "Order ID is required" });
      }
      if (!customer_id || !String(customer_id).trim()) {
        return res.status(400).json({ message: "Customer ID is required" });
      }
      if (!contact || !String(contact).trim()) {
        return res.status(400).json({ message: "Contact is required" });
      }
      if (!order_type || !String(order_type).trim()) {
        return res.status(400).json({ message: "Order type is required" });
      }

      // Check if order_id already exists
      const [existing] = await db.execute("SELECT order_id FROM orders WHERE order_id = ?", [order_id]);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Order ID already exists" });
      }

      const totalAmount = Math.max(0, Number(total_amount) || 0);
      const receivedAmount = 0;
      const pendingAmount = totalAmount;

      await db.execute(
        `INSERT INTO orders (
          order_id, customer_id, contact, order_type, booking_name, shareholder_name,
          cow_number, hissa_number, alt_contact, address, area, day, booking_date,
          total_amount, received_amount, pending_amount, order_source, reference,
          description, rider_id, slot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          order_id,
          customer_id,
          contact,
          order_type,
          booking_name || null,
          shareholder_name || null,
          cow_number || null,
          hissa_number || null,
          alt_contact || null,
          address || null,
          area || null,
          day || null,
          booking_date ? toDateOnly(booking_date) : null,
          totalAmount,
          receivedAmount,
          pendingAmount,
          order_source || null,
          reference || null,
          description || null,
          slot || null,
        ]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_ORDER",
        entity_type: "orders",
        entity_id: order_id,
        new_values: {
          order_id,
          customer_id,
          contact,
          order_type,
          booking_name,
          shareholder_name,
          cow_number: cow_number || null,
          hissa_number: hissa_number || null,
          alt_contact: alt_contact || null,
          address: address || null,
          area: area || null,
          day: day || null,
          slot: slot || null,
          booking_date: booking_date ? toDateOnly(booking_date) : null,
          total_amount: totalAmount,
          order_source: order_source || null,
          reference: reference || null,
          description: description || null,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("BOOKING", "Order created", { user_id: req.userId, order_id });
      res.json({ message: "Order created successfully", order_id });
    } catch (error) {
      logError("BOOKING", "Create order error", error);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_ORDER_ERROR",
        entity_type: "orders",
        new_values: { reason: "server_error" },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/orders", verifyToken, async (req, res) => {
    try {
      const { search, slot, order_type, day, reference, cow_number, year, page, limit } = req.query;
      const conditions = [];
      const params = [];

      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(o.booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
      }
      // year === "all" or empty: no year filter
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(`(
          o.booking_name LIKE ? OR o.shareholder_name LIKE ? OR
          o.contact LIKE ? OR o.alt_contact LIKE ? OR
          o.area LIKE ? OR o.address LIKE ?
        )`);
        params.push(term, term, term, term, term, term);
      }
      if (slot) {
        conditions.push("o.slot = ?");
        params.push(slot);
      }
      const orderTypes = Array.isArray(order_type) ? order_type : order_type ? [order_type] : [];
      if (orderTypes.length > 0) {
        conditions.push(`o.order_type IN (${orderTypes.map(() => "?").join(",")})`);
        params.push(...orderTypes);
      }
      if (day) {
        conditions.push("o.day = ?");
        params.push(day);
      }
      if (reference) {
        conditions.push("o.reference = ?");
        params.push(reference);
      }
      if (cow_number && cow_number.trim()) {
        conditions.push("o.cow_number LIKE ?");
        params.push(`%${cow_number.trim()}%`);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const fromClause = `
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(bank) AS bank, SUM(cash) AS cash
          FROM payments
          GROUP BY order_id
        ) p ON o.order_id = p.order_id
        ${whereClause}
      `;

      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
        params
      );
      const total = countRows[0]?.total ?? 0;

      const query = `
        SELECT
          o.customer_id AS customer_id,
          o.order_id AS order_id,
          o.cow_number AS cow,
          o.hissa_number AS hissa,
          o.slot AS slot,
          o.booking_name AS booking_name,
          o.shareholder_name AS shareholder_name,
          o.contact AS phone_number,
          o.alt_contact AS alt_phone,
          o.address AS address,
          o.area AS area,
          o.day AS day,
          o.order_type AS type,
          o.booking_date AS booking_date,
          o.total_amount AS total_amount,
          COALESCE(p.bank, 0) AS bank,
          COALESCE(p.cash, 0) AS cash,
          o.received_amount AS received,
          o.pending_amount AS pending,
          o.order_source AS source,
          o.reference AS reference,
          o.description AS description,
          CASE WHEN COALESCE(o.pending_amount, 0) > 0 THEN 'Pending' ELSE 'Paid' END AS payment_status
        ${fromClause}
        ORDER BY o.created_at DESC
        ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}
      `;

      const [rows] = await db.execute(query, params);
      const normalized = rows.map((r) => ({ ...r, booking_date: toDateOnly(r.booking_date) ?? r.booking_date }));
      log("BOOKING", "Orders list fetched", { user_id: req.userId, count: rows.length, total, page: pageNum });
      res.json({ data: normalized, total });
    } catch (error) {
      logError("BOOKING", "Orders list error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "ORDER_LIST_ERROR", entity_type: "orders", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // Orders summary (totals over all orders matching filters - for amount divs on Transactions)
  app.get("/api/booking/orders/summary", verifyToken, async (req, res) => {
    try {
      const { year, order_type } = req.query;
      const conditions = [];
      const params = [];
      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(o.booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
      }
      const types = Array.isArray(order_type) ? order_type : order_type ? [order_type] : [];
      if (types.length > 0) {
        conditions.push(`o.order_type IN (${types.map(() => "?").join(",")})`);
        params.push(...types);
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await db.execute(
        `SELECT COALESCE(SUM(p.bank), 0) AS total_bank, COALESCE(SUM(p.cash), 0) AS total_cash
         FROM orders o
         LEFT JOIN (SELECT order_id, SUM(bank) AS bank, SUM(cash) AS cash FROM payments GROUP BY order_id) p ON o.order_id = p.order_id
         ${whereClause}`,
        params
      );
      res.json({
        totalBank: Number(rows[0]?.total_bank ?? 0),
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (error) {
      logError("BOOKING", "Orders summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/orders/filters", verifyToken, async (req, res) => {
    try {
      const { year } = req.query;
      const conditions = [];
      const params = [];
      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(booking_date IS NULL OR YEAR(booking_date) < 2025)");
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const andOrWhere = whereClause ? " AND " : " WHERE ";

      const [slots] = await db.execute(`SELECT DISTINCT slot AS value FROM orders ${whereClause}${andOrWhere}slot IS NOT NULL AND slot != '' ORDER BY slot`, params);
      const [types] = await db.execute(`SELECT DISTINCT order_type AS value FROM orders ${whereClause}${andOrWhere}order_type IS NOT NULL ORDER BY order_type`, params);
      const [days] = await db.execute(`SELECT DISTINCT day AS value FROM orders ${whereClause}${andOrWhere}day IS NOT NULL ORDER BY day`, params);
      const [refs] = await db.execute(`SELECT DISTINCT reference AS value FROM orders ${whereClause}${andOrWhere}reference IS NOT NULL AND reference != '' ORDER BY reference`, params);
      res.json({
        slots: slots.map((r) => r.value),
        order_types: types.map((r) => r.value),
        days: days.map((r) => r.value),
        references: refs.map((r) => r.value),
      });
    } catch (error) {
      logError("BOOKING", "Orders filters error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "ORDER_FILTERS_ERROR", entity_type: "orders", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Leads (Query Management) ---
  app.get("/api/booking/leads", verifyToken, async (req, res) => {
    try {
      const { search, order_type, day, reference, area, year, page, limit } = req.query;
      const conditions = [];
      const params = [];

      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(l.booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(l.booking_date IS NULL OR YEAR(l.booking_date) < 2025)");
      }
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(`(
          l.booking_name LIKE ? OR l.shareholder_name LIKE ? OR
          l.contact LIKE ? OR l.alt_contact LIKE ? OR
          l.area LIKE ? OR l.address LIKE ? OR l.customer_id LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term);
      }
      if (order_type) {
        conditions.push("l.order_type = ?");
        params.push(order_type);
      }
      if (day) {
        conditions.push("l.day = ?");
        params.push(day);
      }
      if (reference) {
        conditions.push("l.reference = ?");
        params.push(reference);
      }
      if (area && area.trim()) {
        conditions.push("l.area = ?");
        params.push(area.trim());
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM leads l ${whereClause}`,
        params
      );
      const total = countRows[0]?.total ?? 0;

      const query = `
        SELECT
          l.lead_id AS lead_id,
          l.customer_id AS customer_id,
          l.booking_name AS booking_name,
          l.shareholder_name AS shareholder_name,
          l.contact AS phone_number,
          l.alt_contact AS alt_phone,
          l.address AS address,
          l.area AS area,
          l.day AS day,
          l.order_type AS type,
          l.booking_date AS booking_date,
          l.total_amount AS total_amount,
          l.order_source AS source,
          l.reference AS reference,
          l.description AS description,
          l.created_at AS created_at
        FROM leads l
        ${whereClause}
        ORDER BY l.created_at DESC
        ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}
      `;
      const [rows] = await db.execute(query, params);
      const normalized = rows.map((r) => ({ ...r, booking_date: toDateOnly(r.booking_date) ?? r.booking_date }));
      log("BOOKING", "Leads list fetched", { user_id: req.userId, count: rows.length, total, page: pageNum });
      res.json({ data: normalized, total });
    } catch (error) {
      logError("BOOKING", "Leads list error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "LEADS_LIST_ERROR", entity_type: "leads", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/booking/leads/filters", verifyToken, async (req, res) => {
    try {
      const { year } = req.query;
      const conditions = [];
      const params = [];
      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(booking_date IS NULL OR YEAR(booking_date) < 2025)");
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const andOrWhere = whereClause ? " AND " : " WHERE ";

      const [types] = await db.execute(`SELECT DISTINCT order_type AS value FROM leads ${whereClause}${andOrWhere}order_type IS NOT NULL ORDER BY order_type`, params);
      const [days] = await db.execute(`SELECT DISTINCT day AS value FROM leads ${whereClause}${andOrWhere}day IS NOT NULL ORDER BY day`, params);
      const [refs] = await db.execute(`SELECT DISTINCT reference AS value FROM leads ${whereClause}${andOrWhere}reference IS NOT NULL AND reference != '' ORDER BY reference`, params);
      const [areas] = await db.execute(`SELECT DISTINCT area AS value FROM leads ${whereClause}${andOrWhere}area IS NOT NULL AND area != '' ORDER BY area`, params);
      res.json({
        order_types: types.map((r) => r.value),
        days: days.map((r) => r.value),
        references: refs.map((r) => r.value),
        areas: areas.map((r) => r.value),
      });
    } catch (error) {
      logError("BOOKING", "Leads filters error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  /** Map lead row from DB (contact, alt_contact, order_type, order_source) to client shape (phone_number, alt_phone, type, source) for audit display */
  function leadRowToClientShape(row) {
    if (!row) return null;
    const { contact, alt_contact, order_type, order_source, booking_date, ...rest } = row;
    return {
      ...rest,
      phone_number: contact,
      alt_phone: alt_contact,
      type: order_type,
      source: order_source,
      booking_date: toDateOnly(booking_date) ?? booking_date,
    };
  }

  // Update lead
  app.put("/api/booking/leads/:leadId", verifyToken, async (req, res) => {
    try {
      const { leadId } = req.params;
      const body = req.body;
      const [existingRows] = await db.execute(
        "SELECT lead_id, customer_id, contact, alt_contact, order_type, booking_name, shareholder_name, address, area, day, booking_date, total_amount, order_source, reference, description FROM leads WHERE lead_id = ?",
        [leadId]
      );
      if (existingRows.length === 0) return res.status(404).json({ message: "Lead not found" });
      const oldValues = leadRowToClientShape(existingRows[0]);

      const fields = [];
      const params = [];
      const normalized = {
        customer_id: body.customer_id,
        contact: body.contact ?? body.phone_number,
        order_type: body.order_type ?? body.type,
        booking_name: body.booking_name,
        shareholder_name: body.shareholder_name,
        alt_contact: body.alt_contact ?? body.alt_phone,
        address: body.address,
        area: body.area,
        day: body.day,
        booking_date: body.booking_date,
        total_amount: body.total_amount,
        order_source: body.order_source ?? body.source,
        reference: body.reference,
        description: body.description,
      };
      for (const [key, val] of Object.entries(normalized)) {
        if (val !== undefined) {
          fields.push(`\`${key}\` = ?`);
          params.push(key === "booking_date" ? toDateOnly(val) : val);
        }
      }
      if (fields.length === 0) return res.status(400).json({ message: "No fields to update" });
      params.push(leadId);
      await db.execute(`UPDATE leads SET ${fields.join(", ")} WHERE lead_id = ?`, params);
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_LEAD", entity_type: "leads", entity_id: leadId, old_values: oldValues, new_values: body, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Lead updated", { user_id: req.userId, leadId });
      res.json({ message: "Lead updated", lead_id: leadId });
    } catch (error) {
      logError("BOOKING", "Update lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Delete lead (permanent) — store full deleted lead for audit (same pattern as cancel order)
  app.delete("/api/booking/leads/:leadId", verifyToken, async (req, res) => {
    try {
      const { leadId } = req.params;
      const [existing] = await db.execute(
        "SELECT lead_id, customer_id, contact, alt_contact, order_type, booking_name, shareholder_name, address, area, day, booking_date, total_amount, order_source, reference, description FROM leads WHERE lead_id = ?",
        [leadId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Lead not found" });
      const deletedLead = leadRowToClientShape(existing[0]);
      await db.execute("DELETE FROM leads WHERE lead_id = ?", [leadId]);
      await writeAuditLog(db, { user_id: req.userId, action: "DELETE_LEAD", entity_type: "leads", entity_id: leadId, new_values: deletedLead, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Lead deleted", { user_id: req.userId, leadId });
      res.json({ message: "Lead deleted" });
    } catch (error) {
      logError("BOOKING", "Delete lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Confirm lead → create order and remove lead (audit logged). Body may include order_id, slot, booking_date, cow_number, hissa_number.
  app.post("/api/booking/leads/:leadId/confirm-order", verifyToken, async (req, res) => {
    try {
      const { leadId } = req.params;
      const body = req.body || {};
      const [leadRows] = await db.execute(
        "SELECT lead_id, customer_id, contact, order_type AS order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, reference, description FROM leads WHERE lead_id = ?",
        [leadId]
      );
      if (leadRows.length === 0) {
        await writeAuditLog(db, { user_id: req.userId, action: "CONFIRM_LEAD_ORDER_ERROR", entity_type: "leads", entity_id: leadId, new_values: { reason: "lead_not_found" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(404).json({ message: "Lead not found" });
      }
      const lead = leadRows[0];
      const totalAmount = Number(lead.total_amount) || 0;

      let orderId = body.order_id && String(body.order_id).trim() ? String(body.order_id).trim() : null;
      if (!orderId) {
        const [idRows] = await db.execute(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(order_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM orders WHERE order_id LIKE '#O-%'"
        );
        const year = new Date().getFullYear();
        const nextNum = idRows[0]?.nextId ?? 1;
        orderId = `O-${String(nextNum).padStart(4, "0")}-${year}`;
      }

      const slotVal = body.slot != null && String(body.slot).trim() !== "" ? String(body.slot).trim() : null;
      const bookingDateVal = body.booking_date != null && String(body.booking_date).trim() !== "" ? toDateOnly(body.booking_date) : toDateOnly(lead.booking_date);
      const cowNumber = body.cow_number != null && String(body.cow_number).trim() !== "" ? String(body.cow_number).trim() : null;
      const hissaNumber = body.hissa_number != null && String(body.hissa_number).trim() !== "" ? String(body.hissa_number).trim() : null;

      await db.execute(
        `INSERT INTO orders (order_id, customer_id, contact, order_type, booking_name, shareholder_name, cow_number, hissa_number, alt_contact, address, area, day, booking_date, total_amount, received_amount, pending_amount, order_source, reference, description, rider_id, slot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?)`,
        [
          orderId,
          lead.customer_id ?? null,
          lead.contact ?? null,
          lead.order_type ?? null,
          lead.booking_name ?? null,
          lead.shareholder_name ?? null,
          cowNumber,
          hissaNumber,
          lead.alt_contact ?? null,
          lead.address ?? null,
          lead.area ?? null,
          lead.day ?? null,
          bookingDateVal ?? null,
          totalAmount,
          totalAmount, // pending_amount
          lead.order_source ?? null,
          lead.reference ?? null,
          lead.description ?? null,
          slotVal,
        ]
      );

      await db.execute("DELETE FROM leads WHERE lead_id = ?", [leadId]);

      const auditDetail = {
        lead_id: leadId,
        order_id: orderId,
        customer_id: lead.customer_id,
        contact: lead.contact,
        order_type: lead.order_type,
        booking_name: lead.booking_name,
        shareholder_name: lead.shareholder_name,
        cow_number: cowNumber,
        hissa_number: hissaNumber,
        slot: slotVal,
        day: lead.day,
        booking_date: bookingDateVal,
        total_amount: totalAmount,
        order_source: lead.order_source || null,
        reference: lead.reference || null,
      };
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CONFIRM_LEAD_ORDER",
        entity_type: "leads",
        entity_id: leadId,
        new_values: auditDetail,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Lead confirmed as order", { user_id: req.userId, leadId, orderId });
      res.json({ message: "Order created from lead", order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Confirm lead order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "CONFIRM_LEAD_ORDER_ERROR", entity_type: "leads", entity_id: req.params.leadId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // --- Transactions (payments + expenses summary and lists) ---
  app.get("/api/booking/transactions", verifyToken, async (req, res) => {
    try {
      const [paySum] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS total_bank, COALESCE(SUM(cash), 0) AS total_cash, COALESCE(SUM(total_received), 0) AS total_received FROM payments"
      );
      const [expSum] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS expenses_bank, COALESCE(SUM(cash), 0) AS expenses_cash FROM booking_expenses"
      );
      const totalBank = Number(paySum[0]?.total_bank ?? 0);
      const totalCash = Number(paySum[0]?.total_cash ?? 0);
      const totalExpensesBank = Number(expSum[0]?.expenses_bank ?? 0);
      const totalExpensesCash = Number(expSum[0]?.expenses_cash ?? 0);
      const onHand = totalBank - totalExpensesBank;
      const actual = totalCash - totalExpensesCash;
      const totalAmount = totalBank + totalCash;

      const [payments] = await db.execute(
        "SELECT p.payment_id, p.bank, p.cash, p.total_received, p.date, p.order_id FROM payments p ORDER BY p.date DESC, p.payment_id DESC"
      );
      const [expenses] = await db.execute(
        "SELECT expense_id, bank, cash, total, done_at, description FROM booking_expenses ORDER BY done_at DESC"
      );

      res.json({
        summary: {
          totalBank,
          totalCash,
          totalExpensesBank,
          totalExpensesCash,
          onHand,
          actual,
          totalAmount,
        },
        payments: payments.map((r) => ({ ...r, date: toDateOnly(r.date) ?? r.date })),
        expenses,
      });
    } catch (error) {
      logError("BOOKING", "Transactions error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Expenses summary (totals over all expenses - for amount divs)
  app.get("/api/booking/expenses/summary", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS total_bank, COALESCE(SUM(cash), 0) AS total_cash FROM booking_expenses"
      );
      res.json({
        totalBank: Number(rows[0]?.total_bank ?? 0),
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (error) {
      logError("BOOKING", "Expenses summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // List booking expenses (for Expenses page, paginated)
  app.get("/api/booking/expenses", verifyToken, async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;
      const [countRows] = await db.execute("SELECT COUNT(*) AS total FROM booking_expenses");
      const total = Number(countRows[0]?.total ?? 0);
      const [rows] = await db.execute(
        `SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM booking_expenses ORDER BY done_at DESC ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}`
      );
      const expenses = rows.map((r) => ({ ...r, done_at: toDateOnly(r.done_at) ?? r.done_at }));
      res.json({ data: expenses, total });
    } catch (error) {
      logError("BOOKING", "Expenses list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Create booking expense
  app.post("/api/booking/expenses", verifyToken, async (req, res) => {
    try {
      let { bank = 0, cash = 0, description = "", done_by = null, done_at = null } = req.body || {};
  
      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
  
      if (addBank === 0 && addCash === 0) {
        return res.status(400).json({ message: "Add at least one of bank or cash amount" });
      }
  
      const total = addBank + addCash;
  
      // Normalize optional fields
      description = String(description || "").trim() || null;
      done_by = done_by ? String(done_by).trim() : null;
  
      // Validate date
      if (done_at) {
        const d = new Date(done_at);
        if (isNaN(d.getTime())) done_at = null;
        else done_at = d.toISOString().split("T")[0];
      } else {
        done_at = null;
      }
  
      const year = new Date().getFullYear();
  
      // Get username
      const [userRows] = await db.execute(
        "SELECT username FROM users WHERE user_id = ?",
        [req.userId]
      );
  
      const username = userRows[0]?.username ?? String(req.userId);
  
      /*
        ⭐ Expense ID Generation
        Format → E-0001-2025
      */
      const [idRows] = await db.execute(
        `SELECT COALESCE(
          MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0
        ) + 1 AS nextId 
        FROM booking_expenses 
        WHERE expense_id LIKE 'E-%'`
      );
  
      const nextId = idRows[0]?.nextId ?? 1;
      const expenseId = `E-${String(nextId).padStart(4, "0")}-${year}`;
  
      // Insert expense
      await db.execute(
        `INSERT INTO booking_expenses 
          (expense_id, bank, cash, total, description, done_by, done_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expenseId,
          addBank,
          addCash,
          total,
          description,
          done_by || username,
          done_at,
          req.userId
        ]
      );
  
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        new_values: {
          bank: addBank,
          cash: addCash,
          total,
          description,
          done_by: done_by || username,
          done_at
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
  
      log("BOOKING", "Expense added", { user_id: req.userId, expenseId });
  
      res.json({
        message: "Expense added",
        expense_id: expenseId
      });
  
    } catch (error) {
      logError("BOOKING", "Add expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update booking expense
  app.put("/api/booking/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
  
      let {
        bank,
        cash,
        description,
        done_by = null,
        done_at = null
      } = req.body || {};
  
      const newBank = Math.max(0, Number(bank) || 0);
      const newCash = Math.max(0, Number(cash) || 0);
  
      if (newBank === 0 && newCash === 0) {
        return res.status(400).json({
          message: "At least one of bank or cash must be greater than 0"
        });
      }
  
      const total = newBank + newCash;
  
      // Normalize text fields
      description = String(description ?? "").trim() || null;
      done_by = done_by ? String(done_by).trim() || null : null;
  
      // Validate date format
      if (done_at) {
        const d = new Date(done_at);
        done_at = isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      } else {
        done_at = null;
      }
  
      const [existing] = await db.execute(
        "SELECT expense_id, bank, cash, total, description, done_by, done_at FROM booking_expenses WHERE expense_id = ?",
        [expenseId]
      );
  
      if (!existing.length) {
        return res.status(404).json({ message: "Expense not found" });
      }
  
      const oldRow = existing[0];
  
      const previousState = {
        expense_id: oldRow.expense_id,
        bank: oldRow.bank,
        cash: oldRow.cash,
        total: oldRow.total,
        description: oldRow.description,
        done_by: oldRow.done_by,
        done_at: oldRow.done_at
      };
  
      await db.execute(
        `UPDATE booking_expenses 
         SET bank = ?, cash = ?, total = ?, description = ?, done_by = ?, done_at = ?
         WHERE expense_id = ?`,
        [
          newBank,
          newCash,
          total,
          description,
          done_by,
          done_at,
          expenseId
        ]
      );
  
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        old_values: previousState,
        new_values: {
          expense_id: expenseId,
          bank: newBank,
          cash: newCash,
          total,
          description,
          done_by,
          done_at
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
  
      log("BOOKING", "Expense updated", { user_id: req.userId, expenseId });
  
      res.json({
        message: "Expense updated",
        expense_id: expenseId
      });
  
    } catch (error) {
      logError("BOOKING", "Update expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

// Get next expense ID (for frontend modal display)
app.get("/api/booking/expenses/next-id", verifyToken, async (req, res) => {
  try {
    const year = new Date().getFullYear();

    const [rows] = await db.execute(`
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0
      ) + 1 AS nextId 
      FROM booking_expenses 
      WHERE expense_id LIKE 'E-%'
    `);

    const nextId = rows[0]?.nextId ?? 1;

    const expenseId = `E-${String(nextId).padStart(4, "0")}-${year}`;

    res.json({ expense_id: expenseId });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
  
  // Delete booking expense
  app.delete("/api/booking/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const [existing] = await db.execute("SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM booking_expenses WHERE expense_id = ?", [expenseId]);
      if (existing.length === 0) return res.status(404).json({ message: "Expense not found" });
      const row = existing[0];
      const previousState = { expense_id: row.expense_id, bank: row.bank, cash: row.cash, total: row.total, done_at: toDateOnly(row.done_at) ?? row.done_at, description: row.description, done_by: row.done_by };
      await db.execute("DELETE FROM booking_expenses WHERE expense_id = ?", [expenseId]);
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "DELETE_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        old_values: previousState,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Expense deleted", { user_id: req.userId, expenseId });
      res.json({ message: "Expense deleted", expense_id: expenseId });
    } catch (error) {
      logError("BOOKING", "Delete expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Log expenses export (client calls after generating Excel)
  app.post("/api/booking/expenses/export-audit", verifyToken, async (req, res) => {
    try {
      const { count, expense_ids } = req.body || {};
      const exportCount = typeof count === "number" && count >= 0 ? count : 0;
      const newValues = { count: exportCount };
      if (Array.isArray(expense_ids) && expense_ids.length > 0) {
        newValues.expense_ids = expense_ids.length === exportCount && exportCount > 0 ? "all" : expense_ids;
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "EXPENSES_EXPORT",
        entity_type: "booking_expenses",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Expenses export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (error) {
      logError("BOOKING", "Expenses export audit error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Add payment to an order (for Update Transaction modal)
  app.post("/api/booking/orders/:orderId/payments", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
  
      const { bank = 0, cash = 0 } = req.body || {};
  
      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
  
      if (addBank === 0 && addCash === 0) {
        return res.status(400).json({
          message: "Add at least one of bank or cash amount"
        });
      }
  
      // ⭐ Fetch Order
      const [orders] = await db.execute(
        "SELECT * FROM orders WHERE order_id = ?",
        [orderId]
      );
  
      if (!orders.length) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      const order = orders[0];
  
      const totalAmount = Number(order.total_amount) || 0;
      const currentReceived = Number(order.received_amount) || 0;
  
      const paymentAmount = addBank + addCash;
      const newReceived = currentReceived + paymentAmount;
  
      // ⭐ Prevent Overpayment
      if (newReceived > totalAmount) {
        return res.status(400).json({
          message: "Total received cannot exceed order total amount"
        });
      }
  
      // ⭐ Generate Payment ID
      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id, 3, 4) AS UNSIGNED)),0)+1 AS nextId FROM payments WHERE payment_id LIKE 'P-%'"
      );
  
      const year = new Date().getFullYear();
  
      const paymentId = `P-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;
  
      const today = toDateOnly(new Date());
  
      const paymentTotal = addBank + addCash;
  
      // ⭐ Insert Payment (No new schema fields)
      await db.execute(
        `INSERT INTO payments (
          payment_id,
          order_id,
          bank,
          cash,
          total_received,
          date
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          paymentId,
          orderId,
          addBank,
          addCash,
          paymentTotal,
          today
        ]
      );
  
      // ⭐ Update Order Financial State
      await db.execute(
        `UPDATE orders 
         SET received_amount = ?, pending_amount = ?
         WHERE order_id = ?`,
        [
          newReceived,
          Math.max(0, totalAmount - newReceived),
          orderId
        ]
      );
  
      // ⭐ Audit Log With Order Snapshot
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_PAYMENT",
        entity_type: "orders",
        entity_id: orderId,
  
        new_values: {
          payment_id: paymentId,
          bank: addBank,
          cash: addCash,
          total_received: newReceived,
          pending_amount: Math.max(0, totalAmount - newReceived),
  
          order_id: order.order_id,
          customer_id: order.customer_id,
          contact: order.contact,
          order_type: order.order_type,
          booking_name: order.booking_name,
          shareholder_name: order.shareholder_name,
          cow_number: order.cow_number,
          hissa_number: order.hissa_number,
          total_amount: totalAmount
        },
  
        ip_address: req.ip,
        user_agent: req.get("user-agent")
      });
  
      log("BOOKING", "Payment added", {
        user_id: req.userId,
        orderId,
        paymentId
      });
  
      res.json({
        message: "Payment added",
        payment_id: paymentId,
        received: newReceived,
        pending: Math.max(0, totalAmount - newReceived)
      });
  
    } catch (error) {
      logError("BOOKING", "Add payment error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Log lead/query export (client calls after generating Excel)
  app.post("/api/booking/leads/export-audit", verifyToken, async (req, res) => {
    try {
      const { count, filters, lead_ids } = req.body || {};
      const exportCount = typeof count === "number" && count >= 0 ? count : 0;
      const newValues = { count: exportCount };
      if (filters && typeof filters === "object" && Object.keys(filters).length > 0) {
        newValues.filters = filters;
      }
      if (Array.isArray(lead_ids) && lead_ids.length > 0) {
        newValues.lead_ids = lead_ids.length === exportCount && exportCount > 0 ? "all" : lead_ids;
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "LEAD_EXPORT",
        entity_type: "leads",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Leads export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (error) {
      logError("BOOKING", "Leads export audit error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Log order export (client calls after generating Excel)
  app.post("/api/booking/orders/export-audit", verifyToken, async (req, res) => {
    try {
      const { count, filters, order_ids } = req.body || {};
      const exportCount = typeof count === "number" && count >= 0 ? count : 0;
      const newValues = { count: exportCount };
if (filters && typeof filters === "object" && Object.keys(filters).length > 0) {
  newValues.filters = filters;
}
if (Array.isArray(order_ids) && order_ids.length > 0) {
  newValues.order_ids = order_ids.length === exportCount && exportCount > 0 ? "all" : order_ids;
}
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ORDER_EXPORT",
        entity_type: "orders",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Orders export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (error) {
      logError("BOOKING", "Export audit error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update order
  app.put("/api/booking/orders/:orderId", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const body = req.body;
      const [oldRows] = await db.execute(
        `SELECT customer_id, cow_number AS cow, hissa_number AS hissa, slot, booking_name, shareholder_name, contact AS phone_number, alt_contact AS alt_phone, address, area, day, order_type AS type, booking_date, total_amount, received_amount AS received, pending_amount AS pending, order_source AS source, reference, description FROM orders WHERE order_id = ?`,
        [orderId]
      );
      const rawOld = oldRows.length > 0 ? oldRows[0] : null;
      const rawNew = { ...body };

      const omitOrderId = (obj) => {
        if (!obj || typeof obj !== "object") return obj;
        const out = { ...obj };
        delete out.order_id;
        return out;
      };
      const oldValues = rawOld ? omitOrderId({ ...rawOld, booking_date: toDateOnly(rawOld.booking_date) }) : null;
      const newValues = omitOrderId({ ...rawNew, booking_date: body.booking_date !== undefined ? toDateOnly(body.booking_date) : undefined });

      const updates = [];
      const params = [];
      const fieldMap = {
        customer_id: "customer_id",
        cow: "cow_number",
        hissa: "hissa_number",
        slot: "slot",
        booking_name: "booking_name",
        shareholder_name: "shareholder_name",
        phone_number: "contact",
        alt_phone: "alt_contact",
        address: "address",
        area: "area",
        day: "day",
        type: "order_type",
        booking_date: "booking_date",
        total_amount: "total_amount",
        received: "received_amount",
        pending: "pending_amount",
        source: "order_source",
        reference: "reference",
        description: "description",
      };
      for (const [clientKey, dbCol] of Object.entries(fieldMap)) {
        if (body[clientKey] !== undefined) {
          updates.push(`\`${dbCol}\` = ?`);
          const value = clientKey === "booking_date" ? toDateOnly(body[clientKey]) : body[clientKey];
          params.push(value);
        }
      }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
      params.push(orderId);
      await db.execute(
        `UPDATE orders SET ${updates.join(", ")} WHERE order_id = ?`,
        params
      );
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_ORDER", entity_type: "orders", entity_id: orderId, old_values: oldValues, new_values: newValues, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order updated", { user_id: req.userId, orderId });
      res.json({ message: "Order updated", order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Update order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_ORDER_ERROR", entity_type: "orders", entity_id: req.params.orderId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // Cancel order: move to cancelled_orders, delete from orders (and payments)
  app.post("/api/booking/orders/:orderId/cancel", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const [rows] = await db.execute(
        "SELECT customer_id, contact, order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, description, reference FROM orders WHERE order_id = ?",
        [orderId]
      );
      if (rows.length === 0) return res.status(404).json({ message: "Order not found" });
      const o = rows[0];
      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM cancelled_orders WHERE id LIKE '#C-%'"
      );
      const year = new Date().getFullYear();
      const nextNum = idRows[0]?.nextId ?? 1;
      const cancelId = `C-${String(nextNum).padStart(4, "0")}-${year}`;
      await db.execute(
        `INSERT INTO cancelled_orders (id, customer_id, contact, order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, description, reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cancelId, o.customer_id, o.contact, o.order_type, o.booking_name, o.shareholder_name, o.alt_contact, o.address, o.area, o.day, o.booking_date, o.total_amount, o.order_source, o.description, o.reference]
      );
      await db.execute("DELETE FROM payments WHERE order_id = ?", [orderId]);
      await db.execute("DELETE FROM orders WHERE order_id = ?", [orderId]);
      const orderDetail = { order_id: orderId, cancelled_id: cancelId, ...o };
      await writeAuditLog(db, { user_id: req.userId, action: "CANCEL_ORDER", entity_type: "orders", entity_id: orderId, new_values: orderDetail, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order cancelled", { user_id: req.userId, orderId, cancelId });
      res.json({ message: "Order cancelled", cancelled_id: cancelId });
    } catch (error) {
      logError("BOOKING", "Cancel order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "CANCEL_ORDER_ERROR", entity_type: "orders", entity_id: req.params.orderId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // Invoice PDF: THE WARSI FARM style - all orders for customer_id, any year
  app.get("/api/booking/invoice/:customerId", verifyToken, async (req, res) => {
    try {
      const { customerId } = req.params;

      // Fetch all orders for this customer (any year), ordered by booking_date then order_id
      const [orders] = await db.execute(
        `SELECT o.order_id, o.cow_number AS cow, o.hissa_number AS hissa, o.booking_name,
                o.shareholder_name, o.contact, o.alt_contact, o.address, o.area, o.day,
                o.order_type AS type, o.booking_date, o.total_amount,
                o.received_amount, o.pending_amount
         FROM orders o
         WHERE o.customer_id = ?
         ORDER BY o.booking_date, o.order_id`,
        [customerId]
      );

      if (orders.length === 0) {
        await writeAuditLog(db, { user_id: req.userId, action: "INVOICE_NO_ORDERS", entity_type: "invoice", entity_id: customerId, new_values: { reason: "no_orders" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(404).json({ message: "No orders found for this customer" });
      }

      // Generate sequential invoice number: find max from audit_logs for this customer
      // Format: #I-NNNN-YYYY where YYYY = year of first order's booking_date
      const firstBookingYear = (() => {
        const d = orders[0].booking_date;
        if (!d) return new Date().getFullYear();
        const yr = new Date(d).getFullYear();
        return isNaN(yr) ? new Date().getFullYear() : yr;
      })();

      // Get next invoice sequence number by counting previous INVOICE_GENERATED entries for any customer
      const [seqRows] = await db.execute(
        `SELECT COUNT(*) AS cnt FROM audit_logs WHERE action = 'INVOICE_GENERATED'`
      );
      const invoiceSeq = (Number(seqRows[0]?.cnt ?? 0) + 1);
      const invoiceNumber = `#I-${String(invoiceSeq).padStart(4, "0")}-${firstBookingYear}`;

      const customer = orders[0];
      const bookingDateStr = toDateOnly(customer.booking_date) || "";
      const issuedDate = toDateOnly(new Date()) || new Date().toISOString().split("T")[0];

      // Grand totals across all orders
      let grandTotal = 0;
      let grandReceived = 0;
      let grandPending = 0;
      for (const row of orders) {
        grandTotal += Number(row.total_amount || 0);
        grandReceived += Number(row.received_amount || 0);
        grandPending += Number(row.pending_amount || 0);
      }

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "INVOICE_GENERATED",
        entity_type: "invoice",
        entity_id: customerId,
        new_values: { customer_id: customerId, invoice_number: invoiceNumber, order_count: orders.length, grand_total: grandTotal, grand_received: grandReceived, grand_pending: grandPending },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      const fmt = (n) => Math.round(Number(n || 0)).toLocaleString("en-PK");

      // Serve inline so it opens in browser tab (not forced download)
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber.replace("#", "")}-${customerId}.pdf"`);

      const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
      doc.pipe(res);

      // ── Layout constants ──────────────────────────────────────────────────────
      const left   = 50;
      const right  = doc.page.width - 50;          // 545
      const pageW  = right - left;                  // 495
      const pageH  = doc.page.height;               // 841.89
      const gray   = "#888888";
      const footerZoneTop  = pageH - 48;
      const contentBottom  = footerZoneTop - 8;

      // ── Helper: word-wrap text at given font size ─────────────────────────────
      const wrapText = (text, maxW, font, size) => {
        doc.font(font).fontSize(size);
        const words = String(text || "").split(/\s+/);
        const lines = [];
        let line = "";
        for (const w of words) {
          const candidate = line ? `${line} ${w}` : w;
          if (doc.widthOfString(candidate) <= maxW) { line = candidate; }
          else { if (line) lines.push(line); line = w; }
        }
        if (line) lines.push(line);
        return lines;
      };

      // ── HEADER ────────────────────────────────────────────────────────────────
      // "THE WARSI FARM" top-left, "INVOICE" top-right
      doc.fontSize(18).font("Helvetica-Bold").fillColor("#000000")
         .text("THE WARSI FARM", left, 50, { lineBreak: false });

      doc.fontSize(14).font("Helvetica-Bold")
         .text("INVOICE", left, 50, { width: pageW, align: "right", lineBreak: false });

      // Invoice number right-aligned, below INVOICE label
      doc.fontSize(10).font("Helvetica").fillColor("#333333")
         .text(invoiceNumber, left, 67, { width: pageW, align: "right", lineBreak: false });
      doc.fillColor("#000000");

      // Horizontal rule below header
      doc.strokeColor(gray).lineWidth(0.5)
         .moveTo(left, 82).lineTo(right, 82).stroke()
         .strokeColor("#000000").lineWidth(1);

      // ── INFO BLOCK (3 columns) ────────────────────────────────────────────────
      // Col 1: Booking Date / Issued Date  (left edge → left+160)
      // Col 2: Billed to                   (left+180 → right-180)
      // Col 3: From                         (right-180 → right)
      const blockTop    = 90;
      const blockBottom = 165;
      const col2Left    = left + 160;
      const col3Left    = right - 175;
      const col2Pad     = col2Left + 10;
      const col3Pad     = col3Left + 10;
      const col2Width   = col3Left - col2Pad - 4;
      const col3Width   = right - col3Pad;

      // Col 1 — dates
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000")
         .text("Booking Date", left, blockTop);
      doc.font("Helvetica").fontSize(10)
         .text(bookingDateStr || "—", left, blockTop + 14);
      doc.font("Helvetica-Bold")
         .text("Issued Date", left, blockTop + 32);
      doc.font("Helvetica")
         .text(issuedDate, left, blockTop + 46);

      // Col 2 — Billed to
      doc.font("Helvetica-Bold").fontSize(10)
         .text("Billed to", col2Pad, blockTop);
      doc.font("Helvetica").fontSize(10);
      const billName = (customer.shareholder_name || customer.booking_name || "—").trim();
      doc.text(billName,          col2Pad, blockTop + 14, { width: col2Width, lineBreak: false });
      doc.text(customer.contact || "—", col2Pad, blockTop + 28, { width: col2Width, lineBreak: false });
      const billAddr = [customer.address, customer.area].filter(Boolean).join(", ");
      if (billAddr) doc.text(billAddr, col2Pad, blockTop + 42, { width: col2Width, lineBreak: false });

      // Col 3 — From
      doc.font("Helvetica-Bold").fontSize(10)
         .text("From", col3Pad, blockTop);
      doc.font("Helvetica").fontSize(10)
         .text("The Warsi Farm",         col3Pad, blockTop + 14, { width: col3Width, lineBreak: false })
         .text("B-655, F.B.A Block # 13,", col3Pad, blockTop + 28, { width: col3Width, lineBreak: false })
         .text("Gulberg, Karachi",         col3Pad, blockTop + 42, { width: col3Width, lineBreak: false });

      // Vertical dividers between the 3 columns
      doc.strokeColor(gray).lineWidth(0.5)
         .moveTo(col2Left, blockTop).lineTo(col2Left, blockBottom).stroke()
         .moveTo(col3Left, blockTop).lineTo(col3Left, blockBottom).stroke()
         .strokeColor("#000000").lineWidth(1);

      // ── SERVICE TABLE ─────────────────────────────────────────────────────────
      let y = blockBottom + 4;

      // Table top rule
      doc.strokeColor(gray).lineWidth(0.5)
         .moveTo(left, y).lineTo(right, y).stroke()
         .strokeColor("#000000").lineWidth(1);
      y += 10;

      // Table header row — 5 columns: Service | Qty | Total | Paid | Due
      const qtyX   = right - 280;
      const totX   = right - 210;
      const totW   = 70;
      const paidX  = right - 130;
      const paidW  = 65;
      const dueX   = right - 60;
      const dueW   = 60;
      const qtyW   = 30;
      const svcW   = qtyX - left - 8;

      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000");
      doc.text("Service", left,  y, { width: svcW,  lineBreak: false });
      doc.text("Qty",     qtyX,  y, { width: qtyW,  align: "center", lineBreak: false });
      doc.text("Total",   totX,  y, { width: totW,  align: "center", lineBreak: false });
      doc.text("Paid",    paidX, y, { width: paidW, align: "center", lineBreak: false });
      doc.text("Due",     dueX,  y, { width: dueW,  align: "center", lineBreak: false });
      y += 16;

      // Table body — one row per order
      doc.font("Helvetica").fontSize(10).fillColor("#000000");
      for (const row of orders) {
        // If near bottom of page, add new page
        if (y + 40 > contentBottom) {
          doc.addPage();
          y = 50;
        }

        const serviceTitle = row.type || "Booking";
        const serviceSub = `Cow No: ${row.cow || "—"} | Hissa No: ${row.hissa || "—"} • ${row.day || "—"}`;

        const rowStartY = y;

        // Service title (bold)
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000")
           .text(serviceTitle, left, y, { width: svcW, lineBreak: false });
        y += 13;

        // Sub-line (regular, muted)
        doc.font("Helvetica").fontSize(9).fillColor("#444444")
           .text(serviceSub, left, y, { width: svcW, lineBreak: false });
        doc.fillColor("#000000");
        y += 12;

        // Qty, Total, Paid, Due — all center-aligned, aligned to title line
        doc.font("Helvetica").fontSize(10).fillColor("#000000");
        doc.text("1",                               qtyX,  rowStartY, { width: qtyW,  align: "center", lineBreak: false });
        doc.text(`PKR ${fmt(row.total_amount)}`,    totX,  rowStartY, { width: totW,  align: "center", lineBreak: false });

        // Paid — green
        doc.font("Helvetica").fontSize(10).fillColor("#166534")
           .text(`PKR ${fmt(row.received_amount)}`, paidX, rowStartY, { width: paidW, align: "center", lineBreak: false });

        // Due — red
        doc.font("Helvetica").fontSize(10).fillColor("#b91c1c")
           .text(`PKR ${fmt(row.pending_amount)}`,  dueX,  rowStartY, { width: dueW,  align: "center", lineBreak: false });

        doc.fillColor("#000000");
        y += 4; // row gap
      }

      // Table bottom rule
      doc.strokeColor(gray).lineWidth(0.5)
         .moveTo(left, y).lineTo(right, y).stroke()
         .strokeColor("#000000").lineWidth(1);
      y += 12;

      // ── SUMMARY (right half, like the PDF) ───────────────────────────────────
      // Layout: label right-aligned in left portion, value right-aligned at far right
      // Matches PDF: "Subtotal:" ... "PKR 23,000"
      const sumBlockLeft  = right - 230;   // left edge of summary block
      const sumLabelRight = right - 110;   // right edge of label column
      const sumLabelW     = sumLabelRight - sumBlockLeft;
      const sumValX       = right - 108;   // start of value column
      const sumValW       = 108;

      const drawSummaryRow = (label, value, labelFont, labelColor, ruleColor) => {
        doc.font(labelFont).fontSize(10).fillColor(labelColor)
           .text(label, sumBlockLeft, y, { width: sumLabelW, align: "right", lineBreak: false });
        doc.font(labelFont).fontSize(10).fillColor(labelColor)
           .text(value, sumValX, y, { width: sumValW, align: "right", lineBreak: false });
        doc.fillColor("#000000");
        y += 13;
        doc.strokeColor(ruleColor || "#cccccc").lineWidth(0.5)
           .moveTo(sumBlockLeft, y).lineTo(right, y).stroke()
           .strokeColor("#000000").lineWidth(1);
        y += 5;
      };

      drawSummaryRow("Subtotal:",  `PKR ${fmt(grandTotal)}`,    "Helvetica-Bold", "#000000", "#cccccc");
      drawSummaryRow("Delivery:",  "Free",                       "Helvetica",      "#000000", "#cccccc");
      drawSummaryRow("Total:",     `PKR ${fmt(grandTotal)}`,    "Helvetica-Bold", "#000000", "#cccccc");

      // Amount Paid — green
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#166534")
         .text("Amount Paid:", sumBlockLeft, y, { width: sumLabelW, align: "right", lineBreak: false });
      doc.text(`PKR ${fmt(grandReceived)}`, sumValX, y, { width: sumValW, align: "right", lineBreak: false });
      doc.fillColor("#000000");
      y += 13;
      doc.strokeColor("#166534").lineWidth(0.5)
         .moveTo(sumBlockLeft, y).lineTo(right, y).stroke()
         .strokeColor("#000000").lineWidth(1);
      y += 5;

      // Amount Due — red
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c")
         .text("Amount Due:", sumBlockLeft, y, { width: sumLabelW, align: "right", lineBreak: false });
      doc.text(`PKR ${fmt(grandPending)}`, sumValX, y, { width: sumValW, align: "right", lineBreak: false });
      doc.fillColor("#000000");
      y += 13;
      doc.strokeColor("#b91c1c").lineWidth(0.5)
         .moveTo(sumBlockLeft, y).lineTo(right, y).stroke()
         .strokeColor("#000000").lineWidth(1);
      y += 16;

      // ── PAYMENT INFO ──────────────────────────────────────────────────────────
      if (y + 60 > contentBottom) { doc.addPage(); y = 50; }

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000")
         .text("PAYMENT INFO", left, y);
      y += 12;

      // Header row
      const pi1 = left;
      const pi2 = left + 130;
      const pi3 = left + 275;
      const pi4 = left + 400;

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#555555");
      doc.text("ACCOUNT NAME (Meezan)", pi1, y, { lineBreak: false });
      doc.text("BRANCH",              pi2, y, { lineBreak: false });
      doc.text("IBAN",                pi3, y, { lineBreak: false });
      doc.text("ACCOUNT NO",          pi4, y, { lineBreak: false });
      y += 12;

      // Values
      doc.font("Helvetica").fontSize(9).fillColor("#000000");
      doc.text("THE WARSI FARM",                   pi1, y, { lineBreak: false });
      doc.text("FB AREA BLOCK 12 BRANCH",         pi2, y, { lineBreak: false });
      doc.text("PK03MEZN0010180114502823",      pi3, y, { width: 120, lineBreak: false });
      doc.text("10180114502823",                pi4, y, { lineBreak: false });
      y += 18;

      // ── TERMS & CONDITIONS ────────────────────────────────────────────────────
      if (y + 30 > contentBottom) { doc.addPage(); y = 50; }

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000")
         .text("TERMS & CONDITIONS", left, y);
      y += 12;

      const terms = [
        "Livestock bookings must be paid in full at the time of purchase. For Qurbani orders, full payment is required at least 7 days before Eid.",
        "Accepted payment methods: Cash, Bank Transfer, Easypaisa, JazzCash, or Online Checkout.",
        "Free delivery within Karachi. Delivery timelines are communicated at the time of booking. Delays due to unforeseen events will be informed in advance.",
        "Ensure accurate delivery information and availability at the time of delivery. Any delays caused due to incorrect information or unavailability at delivery address will not be compensated.",
        "THE WARSI FARM is not liable for delays or issues caused by unforeseen circumstances like natural disasters, transport strikes, or technical faults.",
      ];
      doc.font("Helvetica").fontSize(8).fillColor("#000000");
      for (let i = 0; i < terms.length; i++) {
        const lines = wrapText(`${i + 1}. ${terms[i]}`, pageW, "Helvetica", 8);
        for (const line of lines) {
          if (y + 10 > contentBottom) break;
          doc.text(line, left, y, { lineBreak: false });
          y += 11;
        }
        y += 3;
      }

      // ── FOOTER ───────────────────────────────────────────────────────────────
      const footerY = footerZoneTop + 2;
      doc.strokeColor(gray).lineWidth(0.5)
         .moveTo(left, footerZoneTop - 4).lineTo(right, footerZoneTop - 4).stroke()
         .strokeColor("#000000").lineWidth(1);
      doc.font("Helvetica").fontSize(9).fillColor("#000000");
      doc.text("The Warsi Farm", left, footerY, { lineBreak: false });
      const footerRight = "0331-4211466  |  0332-4211466  |  thewarsifarm.com";
      doc.text(footerRight, right - doc.widthOfString(footerRight), footerY, { lineBreak: false });

      doc.end();
    } catch (error) {
      logError("BOOKING", "Invoice error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "INVOICE_ERROR", entity_type: "invoice", entity_id: req.params.customerId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });
};