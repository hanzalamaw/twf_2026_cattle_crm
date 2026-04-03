import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { limitOffsetClause } from "../utils/sqlPagination.js";

/** Normalize to date-only YYYY-MM-DD (avoids timezone shift). */
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

function safeNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampMoney(n) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.round(v * 100) / 100);
}

function deriveYearFromDate(dateStr) {
  if (!dateStr) return new Date().getFullYear();
  const d = new Date(dateStr);
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

export const registerProcurementRoutes = (app, db, verifyToken) => {
  // Generate procurement ID: N-0001-2026 (sequence per year)
  app.post("/api/procurement/generate-procurement-id", verifyToken, async (req, res) => {
    try {
      const year = deriveYearFromDate(req.body?.date) || 2026;
      const pattern = `N-%-${year}`;

      const [rows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(procurement_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM procurements WHERE procurement_id LIKE ?",
        [pattern]
      );
      const nextNum = Number(rows[0]?.maxNum || 0) + 1;
      const procurementId = `N-${String(nextNum).padStart(4, "0")}-${year}`;

      log("PROCUREMENT", "Procurement ID generated", { user_id: req.userId, procurement_id: procurementId, year });
      res.json({ procurement_id: procurementId });
    } catch (error) {
      logError("PROCUREMENT", "Generate procurement ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Create procurement
  app.post("/api/procurement", verifyToken, async (req, res) => {
    try {
      const body = req.body || {};
      const procurement_id = String(body.procurement_id || "").trim();
      const type = String(body.type || "").trim();
      const no_of_animals = Math.max(0, parseInt(body.no_of_animals, 10) || 0);
      const date = toDateOnly(body.date);

      if (!procurement_id) return res.status(400).json({ message: "Procurement ID is required" });
      if (!type) return res.status(400).json({ message: "Type is required" });
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ message: "Date is required (YYYY-MM-DD)" });

      const [existing] = await db.execute("SELECT procurement_id FROM procurements WHERE procurement_id = ?", [procurement_id]);
      if (existing.length > 0) return res.status(400).json({ message: "Procurement ID already exists" });

      const totalRaw = safeNum(body.total_price);
      const ppuRaw = safeNum(body.price_per_unit);
      const paidRaw = safeNum(body.price_paid);
      const perUnitWeightRaw = safeNum(body.per_unit_weight);

      let total_price = clampMoney(totalRaw ?? 0);
      let price_per_unit = ppuRaw != null ? clampMoney(ppuRaw) : null;

      if ((totalRaw == null || totalRaw === 0) && price_per_unit != null && no_of_animals > 0) {
        total_price = clampMoney(price_per_unit * no_of_animals);
      } else if ((ppuRaw == null || ppuRaw === 0) && total_price > 0 && no_of_animals > 0) {
        price_per_unit = clampMoney(total_price / no_of_animals);
      }

      const price_paid = clampMoney(paidRaw ?? 0);
      if (price_paid > total_price) return res.status(400).json({ message: "Price paid cannot exceed total price" });
      const price_due = clampMoney(total_price - price_paid);

      await db.execute(
        `INSERT INTO procurements
          (procurement_id, type, no_of_animals, price_per_unit, total_price, price_paid, price_due, per_unit_weight, date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          procurement_id,
          type,
          no_of_animals,
          price_per_unit,
          total_price,
          price_paid,
          price_due,
          perUnitWeightRaw != null ? clampMoney(perUnitWeightRaw) : null,
          date,
          req.userId,
        ]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_PROCUREMENT",
        entity_type: "procurements",
        entity_id: procurement_id,
        new_values: {
          procurement_id,
          type,
          no_of_animals,
          price_per_unit,
          total_price,
          price_paid,
          price_due,
          per_unit_weight: perUnitWeightRaw != null ? clampMoney(perUnitWeightRaw) : null,
          date,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("PROCUREMENT", "Procurement created", { user_id: req.userId, procurement_id });
      res.json({ message: "Procurement created successfully", procurement_id });
    } catch (error) {
      logError("PROCUREMENT", "Create procurement error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // List procurements (paginated)
  app.get("/api/procurement", verifyToken, async (req, res) => {
    try {
      const { search, type, year, page, limit } = req.query;
      const conditions = [];
      const params = [];

      if (year && year !== "all") {
        const y = parseInt(year, 10);
        if (Number.isFinite(y)) {
          conditions.push("YEAR(p.date) = ?");
          params.push(y);
        }
      }

      if (type && String(type).trim()) {
        conditions.push("p.type = ?");
        params.push(String(type).trim());
      }

      if (search && String(search).trim()) {
        const term = `%${String(search).trim()}%`;
        conditions.push("(p.procurement_id LIKE ? OR p.type LIKE ?)");
        params.push(term, term);
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM procurements p ${whereClause}`, params);
      const total = countRows[0]?.total ?? 0;

      const [rows] = await db.execute(
        `SELECT
          p.procurement_id,
          p.type,
          p.no_of_animals,
          p.price_per_unit,
          p.total_price,
          p.price_paid,
          p.price_due,
          p.per_unit_weight,
          p.date,
          p.created_at
         FROM procurements p
         ${whereClause}
         ORDER BY p.created_at DESC
         ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}`,
        params
      );

      res.json({
        data: rows.map((r) => ({ ...r, date: toDateOnly(r.date) ?? r.date })),
        total,
      });
    } catch (error) {
      logError("PROCUREMENT", "Procurement list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Filters (distinct types)
  app.get("/api/procurement/filters", verifyToken, async (req, res) => {
    try {
      const { year } = req.query;
      const conditions = [];
      const params = [];
      if (year && year !== "all") {
        const y = parseInt(year, 10);
        if (Number.isFinite(y)) {
          conditions.push("YEAR(date) = ?");
          params.push(y);
        }
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const [types] = await db.execute(`SELECT DISTINCT type AS value FROM procurements ${whereClause} ORDER BY type`, params);
      res.json({ types: types.map((r) => r.value) });
    } catch (error) {
      logError("PROCUREMENT", "Procurement filters error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update procurement
  app.put("/api/procurement/:procurementId", verifyToken, async (req, res) => {
    try {
      const { procurementId } = req.params;
      const body = req.body || {};

      const [existingRows] = await db.execute(
        "SELECT procurement_id, type, no_of_animals, price_per_unit, total_price, price_paid, price_due, per_unit_weight, date FROM procurements WHERE procurement_id = ?",
        [procurementId]
      );
      if (existingRows.length === 0) return res.status(404).json({ message: "Procurement not found" });
      const oldRow = existingRows[0];

      const type = body.type !== undefined ? String(body.type || "").trim() : oldRow.type;
      const no_of_animals = body.no_of_animals !== undefined ? Math.max(0, parseInt(body.no_of_animals, 10) || 0) : Number(oldRow.no_of_animals || 0);
      const date = body.date !== undefined ? toDateOnly(body.date) : toDateOnly(oldRow.date);

      const totalRaw = body.total_price !== undefined ? safeNum(body.total_price) : safeNum(oldRow.total_price);
      const ppuRaw = body.price_per_unit !== undefined ? safeNum(body.price_per_unit) : safeNum(oldRow.price_per_unit);
      const paidRaw = body.price_paid !== undefined ? safeNum(body.price_paid) : safeNum(oldRow.price_paid);
      const perUnitWeightRaw = body.per_unit_weight !== undefined ? safeNum(body.per_unit_weight) : safeNum(oldRow.per_unit_weight);

      let total_price = clampMoney(totalRaw ?? 0);
      let price_per_unit = ppuRaw != null ? clampMoney(ppuRaw) : null;
      if ((body.total_price === undefined) && (body.price_per_unit !== undefined) && price_per_unit != null && no_of_animals > 0) {
        total_price = clampMoney(price_per_unit * no_of_animals);
      } else if ((body.price_per_unit === undefined) && (body.total_price !== undefined) && total_price > 0 && no_of_animals > 0) {
        price_per_unit = clampMoney(total_price / no_of_animals);
      } else if (body.total_price !== undefined && body.price_per_unit !== undefined && no_of_animals > 0) {
        // keep as provided but normalize totals
      } else {
        if (price_per_unit == null && total_price > 0 && no_of_animals > 0) price_per_unit = clampMoney(total_price / no_of_animals);
      }

      const price_paid = clampMoney(paidRaw ?? 0);
      if (price_paid > total_price) return res.status(400).json({ message: "Price paid cannot exceed total price" });
      const price_due = clampMoney(total_price - price_paid);

      await db.execute(
        `UPDATE procurements
         SET type = ?, no_of_animals = ?, price_per_unit = ?, total_price = ?, price_paid = ?, price_due = ?, per_unit_weight = ?, date = ?
         WHERE procurement_id = ?`,
        [
          type,
          no_of_animals,
          price_per_unit,
          total_price,
          price_paid,
          price_due,
          perUnitWeightRaw != null ? clampMoney(perUnitWeightRaw) : null,
          date,
          procurementId,
        ]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_PROCUREMENT",
        entity_type: "procurements",
        entity_id: procurementId,
        old_values: {
          ...oldRow,
          date: toDateOnly(oldRow.date) ?? oldRow.date,
        },
        new_values: {
          procurement_id: procurementId,
          type,
          no_of_animals,
          price_per_unit,
          total_price,
          price_paid,
          price_due,
          per_unit_weight: perUnitWeightRaw != null ? clampMoney(perUnitWeightRaw) : null,
          date,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({ message: "Procurement updated", procurement_id: procurementId });
    } catch (error) {
      logError("PROCUREMENT", "Update procurement error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Delete procurement
  app.delete("/api/procurement/:procurementId", verifyToken, async (req, res) => {
    try {
      const { procurementId } = req.params;
      const [existing] = await db.execute(
        "SELECT procurement_id, type, no_of_animals, price_per_unit, total_price, price_paid, price_due, per_unit_weight, date FROM procurements WHERE procurement_id = ?",
        [procurementId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Procurement not found" });
      const row = existing[0];

      await db.execute("DELETE FROM procurements WHERE procurement_id = ?", [procurementId]);

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "DELETE_PROCUREMENT",
        entity_type: "procurements",
        entity_id: procurementId,
        old_values: { ...row, date: toDateOnly(row.date) ?? row.date },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({ message: "Procurement deleted", procurement_id: procurementId });
    } catch (error) {
      logError("PROCUREMENT", "Delete procurement error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Dashboard stats
  app.get("/api/procurement/dashboard", verifyToken, async (req, res) => {
    try {
      const { year } = req.query;
      const conditions = [];
      const params = [];
      if (year && year !== "all") {
        const y = parseInt(year, 10);
        if (Number.isFinite(y)) {
          conditions.push("YEAR(date) = ?");
          params.push(y);
        }
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [sumRows] = await db.execute(
        `SELECT
          COUNT(*) AS total_procurements,
          COALESCE(SUM(no_of_animals), 0) AS total_animals,
          COALESCE(SUM(total_price), 0) AS total_amount,
          COALESCE(SUM(price_paid), 0) AS total_paid,
          COALESCE(SUM(price_due), 0) AS total_due
         FROM procurements
         ${whereClause}`,
        params
      );

      const [byTypeRows] = await db.execute(
        `SELECT type, COUNT(*) AS count, COALESCE(SUM(no_of_animals), 0) AS animals, COALESCE(SUM(total_price), 0) AS total
         FROM procurements
         ${whereClause}
         GROUP BY type
         ORDER BY total DESC`,
        params
      );

      res.json({
        summary: {
          totalProcurements: Number(sumRows[0]?.total_procurements ?? 0),
          totalAnimals: Number(sumRows[0]?.total_animals ?? 0),
          totalAmount: Number(sumRows[0]?.total_amount ?? 0),
          totalPaid: Number(sumRows[0]?.total_paid ?? 0),
          totalDue: Number(sumRows[0]?.total_due ?? 0),
        },
        byType: byTypeRows.map((r) => ({
          type: r.type,
          count: Number(r.count ?? 0),
          animals: Number(r.animals ?? 0),
          total: Number(r.total ?? 0),
        })),
      });
    } catch (error) {
      logError("PROCUREMENT", "Dashboard stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Transactions aggregate (payments + expenses)
  app.get("/api/procurement/transactions", verifyToken, async (req, res) => {
    try {
      const [paySum] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS total_bank, COALESCE(SUM(cash), 0) AS total_cash, COALESCE(SUM(total_received), 0) AS total_received FROM procurement_payments"
      );
      const [expSum] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS expenses_bank, COALESCE(SUM(cash), 0) AS expenses_cash FROM procurement_expenses"
      );
      const totalBank = Number(paySum[0]?.total_bank ?? 0);
      const totalCash = Number(paySum[0]?.total_cash ?? 0);
      const totalExpensesBank = Number(expSum[0]?.expenses_bank ?? 0);
      const totalExpensesCash = Number(expSum[0]?.expenses_cash ?? 0);
      const onHand = totalBank - totalExpensesBank;
      const actual = totalCash - totalExpensesCash;

      res.json({
        summary: {
          totalBank,
          totalCash,
          totalExpensesBank,
          totalExpensesCash,
          onHand,
          actual,
          totalAmount: totalBank + totalCash,
        },
      });
    } catch (error) {
      logError("PROCUREMENT", "Transactions summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // List procurements for transactions page (with bank/cash split from payment entries)
  app.get("/api/procurement/transactions/list", verifyToken, async (req, res) => {
    try {
      const { search, type, year, page, limit, payment_status } = req.query;
      const conditions = [];
      const params = [];

      if (year && year !== "all") {
        const y = parseInt(year, 10);
        if (Number.isFinite(y)) {
          conditions.push("YEAR(p.date) = ?");
          params.push(y);
        }
      }
      if (type && String(type).trim()) {
        conditions.push("p.type = ?");
        params.push(String(type).trim());
      }
      if (search && String(search).trim()) {
        const term = `%${String(search).trim()}%`;
        conditions.push("(p.procurement_id LIKE ? OR p.type LIKE ?)");
        params.push(term, term);
      }
      if (payment_status === "pending") {
        conditions.push("COALESCE(p.price_due, 0) > 0");
      } else if (payment_status === "received") {
        conditions.push("COALESCE(p.price_due, 0) <= 0");
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute(`SELECT COUNT(*) AS total FROM procurements p ${whereClause}`, params);
      const total = Number(countRows[0]?.total ?? 0);

      const [rows] = await db.execute(
        `SELECT
          p.procurement_id AS order_id,
          '' AS customer_id,
          p.type AS type,
          p.type AS booking_name,
          '' AS shareholder_name,
          '' AS phone_number,
          p.date AS booking_date,
          p.total_price AS total_amount,
          COALESCE(pp.bank, 0) AS bank,
          COALESCE(pp.cash, 0) AS cash,
          p.price_paid AS received,
          p.price_due AS pending,
          '' AS reference,
          CASE WHEN COALESCE(p.price_due, 0) > 0 THEN 'Pending' ELSE 'Paid' END AS payment_status
         FROM procurements p
         LEFT JOIN (
           SELECT procurement_id, SUM(bank) AS bank, SUM(cash) AS cash
           FROM procurement_payments
           GROUP BY procurement_id
         ) pp ON p.procurement_id = pp.procurement_id
         ${whereClause}
         ORDER BY p.created_at DESC
         ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}`,
        params
      );

      res.json({
        data: rows.map((r) => ({ ...r, date: toDateOnly(r.date) ?? r.date })),
        total,
      });
    } catch (error) {
      logError("PROCUREMENT", "Transactions list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Add payment to a procurement
  app.post("/api/procurement/:procurementId/payments", verifyToken, async (req, res) => {
    try {
      const { procurementId } = req.params;
      const { bank = 0, cash = 0 } = req.body || {};
      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
      if (addBank === 0 && addCash === 0) return res.status(400).json({ message: "Add at least one of bank or cash amount" });

      const [rows] = await db.execute("SELECT procurement_id, total_price, price_paid, price_due FROM procurements WHERE procurement_id = ?", [procurementId]);
      if (!rows.length) return res.status(404).json({ message: "Procurement not found" });
      const row = rows[0];
      const total = Number(row.total_price || 0);
      const currentPaid = Number(row.price_paid || 0);
      const addTotal = addBank + addCash;
      const newPaid = currentPaid + addTotal;
      if (newPaid > total) return res.status(400).json({ message: "Total received cannot exceed total price" });

      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM procurement_payments WHERE payment_id LIKE 'PP-%'"
      );
      const year = new Date().getFullYear();
      const paymentId = `PP-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;
      const today = toDateOnly(new Date());

      await db.execute(
        "INSERT INTO procurement_payments (payment_id, procurement_id, bank, cash, total_received, date) VALUES (?, ?, ?, ?, ?, ?)",
        [paymentId, procurementId, addBank, addCash, addTotal, today]
      );
      await db.execute(
        "UPDATE procurements SET price_paid = ?, price_due = ? WHERE procurement_id = ?",
        [newPaid, Math.max(0, total - newPaid), procurementId]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_PROCUREMENT_PAYMENT",
        entity_type: "procurements",
        entity_id: procurementId,
        new_values: { payment_id: paymentId, bank: addBank, cash: addCash, total_received: newPaid, price_due: Math.max(0, total - newPaid) },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      res.json({ message: "Payment added", payment_id: paymentId, received: newPaid, pending: Math.max(0, total - newPaid) });
    } catch (error) {
      logError("PROCUREMENT", "Add payment error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Expenses summary
  app.get("/api/procurement/expenses/summary", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS total_bank, COALESCE(SUM(cash), 0) AS total_cash FROM procurement_expenses"
      );
      res.json({
        totalBank: Number(rows[0]?.total_bank ?? 0),
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (error) {
      logError("PROCUREMENT", "Expenses summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // List expenses
  app.get("/api/procurement/expenses", verifyToken, async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;
      const [countRows] = await db.execute("SELECT COUNT(*) AS total FROM procurement_expenses");
      const total = Number(countRows[0]?.total ?? 0);
      const [rows] = await db.execute(
        `SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM procurement_expenses ORDER BY done_at DESC ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}`
      );
      res.json({ data: rows.map((r) => ({ ...r, done_at: toDateOnly(r.done_at) ?? r.done_at })), total });
    } catch (error) {
      logError("PROCUREMENT", "Expenses list error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Next expense ID
  app.get("/api/procurement/expenses/next-id", verifyToken, async (req, res) => {
    try {
      const year = new Date().getFullYear();
      const [rows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(expense_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM procurement_expenses WHERE expense_id LIKE 'PE-%'"
      );
      const expenseId = `PE-${String(rows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;
      res.json({ expense_id: expenseId });
    } catch (error) {
      logError("PROCUREMENT", "Next expense ID error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Create expense
  app.post("/api/procurement/expenses", verifyToken, async (req, res) => {
    try {
      let { bank = 0, cash = 0, description = "", done_by = null, done_at = null } = req.body || {};
      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);
      if (addBank === 0 && addCash === 0) return res.status(400).json({ message: "Add at least one of bank or cash amount" });

      const total = addBank + addCash;
      description = String(description || "").trim() || null;
      done_by = done_by ? String(done_by).trim() : null;
      if (done_at) {
        const d = new Date(done_at);
        done_at = isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      } else done_at = null;

      const [userRows] = await db.execute("SELECT username FROM users WHERE user_id = ?", [req.userId]);
      const username = userRows[0]?.username ?? String(req.userId);

      const [idRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING(expense_id, 4, 4) AS UNSIGNED)), 0) + 1 AS nextId FROM procurement_expenses WHERE expense_id LIKE 'PE-%'"
      );
      const year = new Date().getFullYear();
      const expenseId = `PE-${String(idRows[0]?.nextId ?? 1).padStart(4, "0")}-${year}`;

      await db.execute(
        "INSERT INTO procurement_expenses (expense_id, bank, cash, total, description, done_by, done_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [expenseId, addBank, addCash, total, description, done_by || username, done_at, req.userId]
      );
      res.json({ message: "Expense added", expense_id: expenseId });
    } catch (error) {
      logError("PROCUREMENT", "Add expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update expense
  app.put("/api/procurement/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      let { bank, cash, description, done_by = null, done_at = null } = req.body || {};
      const newBank = Math.max(0, Number(bank) || 0);
      const newCash = Math.max(0, Number(cash) || 0);
      if (newBank === 0 && newCash === 0) return res.status(400).json({ message: "At least one of bank or cash must be greater than 0" });
      const total = newBank + newCash;
      description = String(description ?? "").trim() || null;
      done_by = done_by ? String(done_by).trim() || null : null;
      if (done_at) {
        const d = new Date(done_at);
        done_at = isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      } else done_at = null;

      const [existing] = await db.execute("SELECT expense_id FROM procurement_expenses WHERE expense_id = ?", [expenseId]);
      if (!existing.length) return res.status(404).json({ message: "Expense not found" });

      await db.execute(
        "UPDATE procurement_expenses SET bank = ?, cash = ?, total = ?, description = ?, done_by = ?, done_at = ? WHERE expense_id = ?",
        [newBank, newCash, total, description, done_by, done_at, expenseId]
      );
      res.json({ message: "Expense updated", expense_id: expenseId });
    } catch (error) {
      logError("PROCUREMENT", "Update expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Delete expense
  app.delete("/api/procurement/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const [existing] = await db.execute("SELECT expense_id FROM procurement_expenses WHERE expense_id = ?", [expenseId]);
      if (!existing.length) return res.status(404).json({ message: "Expense not found" });
      await db.execute("DELETE FROM procurement_expenses WHERE expense_id = ?", [expenseId]);
      res.json({ message: "Expense deleted", expense_id: expenseId });
    } catch (error) {
      logError("PROCUREMENT", "Delete expense error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};

