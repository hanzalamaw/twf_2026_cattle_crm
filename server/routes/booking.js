import PDFDocument from "pdfkit";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

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
        LIMIT ? OFFSET ?
      `;

      const [rows] = await db.execute(query, [...params, limitNum, offset]);
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
      const [slots] = await db.execute("SELECT DISTINCT slot AS value FROM orders WHERE slot IS NOT NULL AND slot != '' ORDER BY slot");
      const [types] = await db.execute("SELECT DISTINCT order_type AS value FROM orders WHERE order_type IS NOT NULL ORDER BY order_type");
      const [days] = await db.execute("SELECT DISTINCT day AS value FROM orders WHERE day IS NOT NULL ORDER BY day");
      const [refs] = await db.execute("SELECT DISTINCT reference AS value FROM orders WHERE reference IS NOT NULL AND reference != '' ORDER BY reference");
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
        LIMIT ? OFFSET ?
      `;
      const [rows] = await db.execute(query, [...params, limitNum, offset]);
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
      const [types] = await db.execute("SELECT DISTINCT order_type AS value FROM leads WHERE order_type IS NOT NULL ORDER BY order_type");
      const [days] = await db.execute("SELECT DISTINCT day AS value FROM leads WHERE day IS NOT NULL ORDER BY day");
      const [refs] = await db.execute("SELECT DISTINCT reference AS value FROM leads WHERE reference IS NOT NULL AND reference != '' ORDER BY reference");
      const [areas] = await db.execute("SELECT DISTINCT area AS value FROM leads WHERE area IS NOT NULL AND area != '' ORDER BY area");
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

  // Confirm lead → create order and remove lead (audit logged)
  app.post("/api/booking/leads/:leadId/confirm-order", verifyToken, async (req, res) => {
    try {
      const { leadId } = req.params;
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

      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(order_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM orders WHERE order_id LIKE '#O-%'"
      );
      const year = new Date().getFullYear();
      const nextNum = idRows[0]?.nextId ?? 1;
      const orderId = `#O-${String(nextNum).padStart(4, "0")}-${year}`;

      await db.execute(
        `INSERT INTO orders (order_id, customer_id, contact, order_type, booking_name, shareholder_name, cow_number, hissa_number, alt_contact, address, area, day, booking_date, total_amount, received_amount, pending_amount, order_source, reference, description, rider_id, slot)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL, NULL)`,
        [
          orderId,
          lead.customer_id ?? null,
          lead.contact ?? null,
          lead.order_type ?? null,
          lead.booking_name ?? null,
          lead.shareholder_name ?? null,
          lead.alt_contact ?? null,
          lead.address ?? null,
          lead.area ?? null,
          lead.day ?? null,
          toDateOnly(lead.booking_date) ?? null,
          totalAmount,
          totalAmount, // pending_amount
          lead.order_source ?? null,
          lead.reference ?? null,
          lead.description ?? null,
        ]
      );

      await db.execute("DELETE FROM leads WHERE lead_id = ?", [leadId]);

      const auditDetail = { lead_id: leadId, order_id: orderId, customer_id: lead.customer_id, booking_name: lead.booking_name, shareholder_name: lead.shareholder_name, total_amount: totalAmount };
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
        "SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM booking_expenses ORDER BY done_at DESC LIMIT ? OFFSET ?",
        [limitNum, offset]
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
      const { bank = 0, cash = 0, description = "" } = req.body || {};
      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
      if (addBank === 0 && addCash === 0) return res.status(400).json({ message: "Add at least one of bank or cash amount" });
      const total = addBank + addCash;
      const year = new Date().getFullYear();
      const [userRows] = await db.execute("SELECT username FROM users WHERE user_id = ?", [req.userId]);
      const username = userRows[0]?.username ?? String(req.userId);
      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(expense_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM booking_expenses WHERE expense_id LIKE '#E-%'"
      );
      const expenseId = `#E-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;
      await db.execute(
        "INSERT INTO booking_expenses (expense_id, bank, cash, total, description, done_by, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [expenseId, addBank, addCash, total, String(description).trim() || null, username, req.userId]
      );
      await writeAuditLog(db, { user_id: req.userId, action: "ADD_EXPENSE", entity_type: "booking_expenses", entity_id: expenseId, new_values: { bank: addBank, cash: addCash, total, description: String(description).trim() || null }, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Expense added", { user_id: req.userId, expenseId });
      res.json({ message: "Expense added", expense_id: expenseId });
    } catch (error) {
      logError("BOOKING", "Add expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update booking expense
  app.put("/api/booking/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const { bank, cash, description } = req.body || {};
      const newBank = Math.max(0, Number(bank) ?? 0);
      const newCash = Math.max(0, Number(cash) ?? 0);
      if (newBank === 0 && newCash === 0) return res.status(400).json({ message: "At least one of bank or cash must be greater than 0" });
      const total = newBank + newCash;
      const [existing] = await db.execute("SELECT expense_id, bank, cash, total, description FROM booking_expenses WHERE expense_id = ?", [expenseId]);
      if (existing.length === 0) return res.status(404).json({ message: "Expense not found" });
      const oldRow = existing[0];
      const previousState = { expense_id: oldRow.expense_id, bank: oldRow.bank, cash: oldRow.cash, total: oldRow.total, description: oldRow.description };
      await db.execute(
        "UPDATE booking_expenses SET bank = ?, cash = ?, total = ?, description = ? WHERE expense_id = ?",
        [newBank, newCash, total, String(description ?? oldRow.description ?? "").trim() || null, expenseId]
      );
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_EXPENSE",
        entity_type: "booking_expenses",
        entity_id: expenseId,
        old_values: previousState,
        new_values: { expense_id: expenseId, bank: newBank, cash: newCash, total, description: String(description ?? "").trim() || null },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Expense updated", { user_id: req.userId, expenseId });
      res.json({ message: "Expense updated", expense_id: expenseId });
    } catch (error) {
      logError("BOOKING", "Update expense error", error);
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
      if (expense_ids && Array.isArray(expense_ids) && expense_ids.length > 0) {
        newValues.expense_ids = expense_ids;
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
      if (addBank === 0 && addCash === 0) return res.status(400).json({ message: "Add at least one of bank or cash amount" });

      const [orders] = await db.execute(
        "SELECT order_id, total_amount, received_amount, pending_amount FROM orders WHERE order_id = ?",
        [orderId]
      );
      if (orders.length === 0) return res.status(404).json({ message: "Order not found" });
      const order = orders[0];
      const totalAmount = Number(order.total_amount) || 0;
      const currentReceived = Number(order.received_amount) || 0;
      const newReceived = currentReceived + addBank + addCash;
      if (newReceived > totalAmount) return res.status(400).json({ message: "Total received cannot exceed order total amount" });

      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM payments WHERE payment_id LIKE '#P-%'"
      );
      const year = new Date().getFullYear();
      const paymentId = `#P-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;
      const totalReceived = addBank + addCash;
      const today = toDateOnly(new Date());

      await db.execute(
        "INSERT INTO payments (payment_id, bank, cash, total_received, date, order_id) VALUES (?, ?, ?, ?, ?, ?)",
        [paymentId, addBank, addCash, totalReceived, today, orderId]
      );
      await db.execute(
        "UPDATE orders SET received_amount = ?, pending_amount = ? WHERE order_id = ?",
        [newReceived, Math.max(0, totalAmount - newReceived), orderId]
      );

      await writeAuditLog(db, { user_id: req.userId, action: "ADD_PAYMENT", entity_type: "orders", entity_id: orderId, new_values: { payment_id: paymentId, bank: addBank, cash: addCash }, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Payment added", { user_id: req.userId, orderId, paymentId });
      res.json({ message: "Payment added", payment_id: paymentId, received: newReceived, pending: Math.max(0, totalAmount - newReceived) });
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
      if (lead_ids && Array.isArray(lead_ids) && lead_ids.length > 0) {
        newValues.lead_ids = lead_ids;
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
      if (order_ids && Array.isArray(order_ids) && order_ids.length > 0) {
        newValues.order_ids = order_ids;
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
      const cancelId = `#C-${String(nextNum).padStart(4, "0")}-${year}`;
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

  // Invoice PDF: THE WARSI FARM style - all orders for customer_id in year 2026
  app.get("/api/booking/invoice/:customerId", verifyToken, async (req, res) => {
    try {
      const { customerId } = req.params;
      const [orders] = await db.execute(
        `SELECT o.order_id, o.cow_number AS cow, o.hissa_number AS hissa, o.booking_name, o.shareholder_name, o.contact, o.alt_contact, o.address, o.area, o.day, o.order_type AS type, o.booking_date, o.total_amount, o.received_amount, o.pending_amount
         FROM orders o WHERE o.customer_id = ? AND YEAR(o.booking_date) = 2026 ORDER BY o.booking_date, o.order_id`,
        [customerId]
      );
      if (orders.length === 0) {
        await writeAuditLog(db, { user_id: req.userId, action: "INVOICE_NO_ORDERS", entity_type: "invoice", entity_id: customerId, new_values: { reason: "no_orders_2026" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(404).json({ message: "No orders found for this customer in 2026" });
      }
      const customer = orders[0];
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "INVOICE_GENERATED",
        entity_type: "invoice",
        entity_id: customerId,
        new_values: { customer_id: customerId, order_count: orders.length },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      const invoiceNumber = `#I-${String(orders.length).padStart(4, "0")}-2026`;
      const bookingDateStr = toDateOnly(customer.booking_date) || "";
      const issuedDate = toDateOnly(new Date()) || new Date().toISOString().split("T")[0];
      let grandTotal = 0;
      let grandReceived = 0;
      let grandPending = 0;
      for (const row of orders) {
        grandTotal += Number(row.total_amount || 0);
        grandReceived += Number(row.received_amount || 0);
        grandPending += Number(row.pending_amount || 0);
      }
      const fmt = (n) => Math.round(Number(n)).toLocaleString("en-PK");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber.replace("#", "")}-${customerId}.pdf"`);
      const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
      doc.pipe(res);

      const pageW = doc.page.width - 100;
      const pageHeight = doc.page.height;
      const left = 50;
      const right = doc.page.width - 50;

      const footerZoneTop = pageHeight - 48;
      const contentBottom = footerZoneTop - 4;

      const wrapLines = (text, width, fontSize) => {
        doc.font("Helvetica").fontSize(fontSize);
        const words = String(text).split(/\s+/);
        const lines = [];
        let line = "";
        for (const w of words) {
          const tryLine = line ? `${line} ${w}` : w;
          if (doc.widthOfString(tryLine) <= width) line = tryLine;
          else {
            if (line) lines.push(line);
            line = w;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      const textClip = (str, x, y, opts) => {
        const h = opts.height || 200;
        doc.text(str, x, y, { ...opts, height: h });
      };

      const gray = "#888888";

      // --- Header ---
      doc.fontSize(18).font("Helvetica-Bold").text("THE WARSI FARM", left, 50);
      doc.fontSize(14).font("Helvetica-Bold").text("INVOICE", right - 150, 50, { width: 150, align: "right" });
      doc.fontSize(10).font("Helvetica").text(invoiceNumber, right - 150, 66, { width: 150, align: "right" });
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, 82).lineTo(right, 82).stroke().strokeColor("#000000").lineWidth(1);

      const col1Right = left + 160;
      const col2Left = left + 180;
      const col2Right = right - 190;
      const col3Left = right - 180;
      const blockTop = 88;
      const blockBottom = 162;
      const sectionPad = 14;

      const billedLeft = col2Left + sectionPad;
      const billedWidth = col2Right - billedLeft;
      const fromLeft = col3Left + sectionPad;
      const fromWidth = right - fromLeft;

      doc.fontSize(10).font("Helvetica-Bold").text("Booking Date", left, blockTop);
      doc.font("Helvetica").text(bookingDateStr || "—", left, blockTop + 13);
      doc.font("Helvetica-Bold").text("Issued Date", left, blockTop + 30);
      doc.font("Helvetica").text(issuedDate, left, blockTop + 43);

      // Billed to: Bold heading only; then Full Name (not bold), Phone (not bold), Address (not bold)
      doc.fontSize(10).font("Helvetica-Bold").text("Billed to", billedLeft, blockTop);
      doc.font("Helvetica");
      const fullName = (customer.shareholder_name || customer.booking_name || "—").trim();
      doc.text(fullName, billedLeft, blockTop + 14, { width: billedWidth, height: 16 });
      doc.text(customer.contact || "—", billedLeft, blockTop + 30, { width: billedWidth, height: 14 });
      const billedAddr = [customer.address, customer.area].filter(Boolean).join(", ") || "";
      if (billedAddr) doc.text(billedAddr, billedLeft, blockTop + 46, { width: billedWidth, height: 20 });

      // From section: left-aligned with padding left
      doc.font("Helvetica-Bold").text("From", fromLeft, blockTop);
      doc.font("Helvetica").text("The Warsi Farm", fromLeft, blockTop + 14);
      doc.text("B-655, F.B.A Block # 13,", fromLeft, blockTop + 28);
      doc.text("Gulberg, Karachi", fromLeft, blockTop + 42);

      doc.strokeColor(gray).lineWidth(0.5);
      doc.moveTo(col2Left, blockTop).lineTo(col2Left, blockBottom).stroke();
      doc.moveTo(col3Left, blockTop).lineTo(col3Left, blockBottom).stroke();
      doc.strokeColor("#000000").lineWidth(1);

      let y = 165;
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke().strokeColor("#000000").lineWidth(1);
      y += 12;

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Service", left, y);
      doc.text("Qty", right - 180, y, { width: 50, align: "center" });
      doc.text("Total Amount", right - 120, y, { width: 120, align: "right" });
      y += 14;

      doc.font("Helvetica").fontSize(10);
      for (const row of orders) {
        const serviceTitle = row.type || "Booking";
        const serviceSub = `Cow No: ${row.cow || "—"} | Hissa No: ${row.hissa || "—"} • ${row.day || "—"}`;
        textClip(serviceTitle, left, y, { width: pageW - 200, height: 14 });
        y += 12;
        textClip(serviceSub, left, y, { width: pageW - 200, height: 14 });
        doc.text("1", right - 180, y - 12, { width: 50, align: "center" });
        doc.text(`PKR ${fmt(row.total_amount)}`, right - 120, y - 12, { width: 120, align: "right" });
        y += 16;
      }

      y += 4;
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke().strokeColor("#000000").lineWidth(1);
      y += 10;

      // --- Calculation summary: HALF WIDTH, RIGHT SIDE ONLY (not full page) ---
      const summaryWidth = Math.floor(pageW / 2);
      const summaryLeft = right - summaryWidth;
      const sumLineLeft = summaryLeft;
      const sumLineRight = right;
      const labelW = 100;
      const valW = 100;
      const valX = right - valW;

      doc.font("Helvetica-Bold").text("Subtotal:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandTotal)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#999999").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 6;
      doc.font("Helvetica").text("Shipping:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text("Free", valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#999999").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 6;
      doc.font("Helvetica-Bold").text("Total:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandTotal)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#999999").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 8;

      doc.fillColor("#166534").font("Helvetica-Bold").text("Amount Paid:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandReceived)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#166534").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 10;
      doc.fillColor("#b91c1c").font("Helvetica-Bold").text("Amount Due:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandPending)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#b91c1c").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      doc.fillColor("#000000");
      y += 18;

      doc.font("Helvetica-Bold").fontSize(10).text("PAYMENT INFO", left, y);
      y += 10;
      doc.font("Helvetica").fontSize(9);
      doc.text("ACCOUNT NAME (HBL)", left, y);
      doc.text("BRANCH", left + 140, y);
      doc.text("IBAN", left + 280, y);
      doc.text("ACCOUNT NO", left + 400, y);
      y += 11;
      doc.text("TW TRADERS", left, y);
      doc.text("ZIAUDDIN SHAHEED ROA", left + 140, y);
      doc.text("PK10HABB0016787900655603", left + 280, y, { width: 110 });
      doc.text("16787900655603", left + 400, y);
      y += 18;

      doc.font("Helvetica-Bold").fontSize(10).text("TERMS & CONDITIONS", left, y);
      y += 12;
      doc.font("Helvetica").fontSize(8);
      const terms = [
        "Livestock bookings must be paid in full at the time of purchase. For Qurbani orders, full payment is required at least 7 days before Eid.",
        "Accepted payment methods: Cash, Bank Transfer, Easypaisa, JazzCash, or Online Checkout.",
        "Free delivery within Karachi. Delivery timelines are communicated at the time of booking. Delays due to unforeseen events will be informed in advance.",
        "Ensure accurate delivery information and availability at the time of delivery. Any delays caused due to incorrect information or unavailability at delivery address will not be compensated.",
        "THE WARSI FARM is not liable for delays or issues caused by unforeseen circumstances like natural disasters, transport strikes, or technical faults.",
      ];
      const lineHeight = 11;
      const termGap = 4;
      for (let i = 0; i < terms.length; i++) {
        const lines = wrapLines(`${i + 1}. ${terms[i]}`, pageW, 8);
        for (const line of lines) {
          if (y + lineHeight > contentBottom) break;
          doc.text(line, left, y, { width: pageW, height: lineHeight + 2 });
          y += lineHeight;
        }
        y += termGap;
      }

      // Footer: The Warsi Farm left (unchanged); phone | website on same line, right-aligned
      const footerY = footerZoneTop + 2;
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, footerZoneTop - 4).lineTo(right, footerZoneTop - 4).stroke().strokeColor("#000000").lineWidth(1);
      doc.font("Helvetica").fontSize(9);
      doc.text("The Warsi Farm", left, footerY, { lineBreak: false });
      const footerRightStr = "(0331 & 0332) - 9911466  |  thewarsifarm.com";
      doc.text(footerRightStr, right - doc.widthOfString(footerRightStr), footerY, { lineBreak: false });

      doc.end();
    } catch (error) {
      logError("BOOKING", "Invoice error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "INVOICE_ERROR", entity_type: "invoice", entity_id: req.params.customerId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });
};
