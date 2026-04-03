import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";
import { limitOffsetClause } from "../utils/sqlPagination.js";

function toDateOnly(v) {
  if (v == null || v === "") return v;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : s;
}

function buildOrderYearWhere(year, params) {
  const conditions = [];
  if (year === "2026" || year === "2025") {
    conditions.push("YEAR(o.booking_date) = ?");
    params.push(year);
  } else if (year === "2024") {
    conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
  }
  return conditions;
}

function buildLeadYearWhere(year, params) {
  const conditions = [];
  if (year === "2026" || year === "2025") {
    conditions.push("YEAR(l.created_at) = ?");
    params.push(year);
  } else if (year === "2024") {
    conditions.push("(l.created_at IS NULL OR YEAR(l.created_at) < 2025)");
  }
  return conditions;
}

// Farm dashboard normalization:
// - Cow: treat "Cow" and "Full Cow" (and variants) as cow
// - Goat: treat only "Goat" as goat (explicitly exclude "Goat (Hissa)" by mapping it to NULL)
const TYPE_KEY_SQL_FARM_ORDERS = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('cow','fullcow') THEN 'cow'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goat') THEN 'goat'
    ELSE NULL
  END
`;

const TYPE_KEY_SQL_FARM_LEADS = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('cow','fullcow') THEN 'cow'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('goat') THEN 'goat'
    ELSE NULL
  END
`;

export const registerFarmRoutes = (app, db, verifyToken) => {
  // -----------------------
  // Farm Dashboard KPIs
  // -----------------------
  app.get("/api/farm/dashboard/kpis", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;
      const params = [];
      const conditions = buildOrderYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          COUNT(*) AS totalOrders,
          SUM(CASE WHEN COALESCE(o.pending_amount, 0) <= 0 THEN 1 ELSE 0 END) AS clearedOrders,
          SUM(CASE WHEN COALESCE(o.pending_amount, 0) > 0 THEN 1 ELSE 0 END) AS pendingOrders,
          COALESCE(SUM(COALESCE(o.total_amount, 0)), 0) AS totalSales,
          COALESCE(SUM(COALESCE(o.received_amount, 0)), 0) AS receivedPayments,
          COALESCE(SUM(COALESCE(o.pending_amount, 0)), 0) AS pendingAmount
        FROM orders o
        ${where}
        `,
        params
      );

      const r = rows?.[0] || {};
      const totalOrders = Number(r.totalOrders || 0);
      const clearedOrders = Number(r.clearedOrders || 0);
      const clearanceRate = totalOrders > 0 ? (clearedOrders / totalOrders) * 100 : 0;

      res.json({
        kpis: {
          totalOrders,
          clearedOrders,
          clearanceRate,
          pendingPaymentsCount: Number(r.pendingOrders || 0),
          totalSales: Number(r.totalSales || 0),
          receivedPayments: Number(r.receivedPayments || 0),
          pendingAmount: Number(r.pendingAmount || 0),
        },
      });
    } catch (e) {
      logError("FARM", "KPIs error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // Farm Dashboard target achievement (Cow + Goat only)
  // -----------------------
  app.get("/api/farm/dashboard/target-achievement", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;
      const params = [];
      const conditions = buildOrderYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          ${TYPE_KEY_SQL_FARM_ORDERS} AS typeKey,
          COUNT(*) AS cnt
        FROM orders o
        ${where}
        GROUP BY typeKey
        `,
        params
      );

      const map = { cow: 0, goat: 0 };
      for (const row of rows || []) {
        if (row.typeKey && map[row.typeKey] !== undefined) {
          map[row.typeKey] = Number(row.cnt || 0);
        }
      }

      const achievedTotal = map.cow + map.goat;
      const targetTotal = year === "2024" ? 500 : year === "2025" ? 1000 : 2000;

      const breakdown = [
        { key: "cow", label: "Cow", value: map.cow },
        { key: "goat", label: "Goat", value: map.goat },
      ].map((b) => ({
        ...b,
        percentage: achievedTotal > 0 ? (b.value / achievedTotal) * 100 : 0,
      }));

      res.json({
        target: {
          targetTotal,
          achievedTotal,
          remaining: Math.max(0, targetTotal - achievedTotal),
        },
        breakdown,
      });
    } catch (e) {
      logError("FARM", "Target achievement error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // Farm Dashboard Reference-wise
  // -----------------------
  app.get("/api/farm/dashboard/reference-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const paramsO = [];
      const conditionsO = buildOrderYearWhere(year, paramsO);
      conditionsO.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      conditionsO.push("o.reference IS NOT NULL AND o.reference != ''");
      const whereO = conditionsO.length ? `WHERE ${conditionsO.join(" AND ")}` : "";

      const paramsL = [];
      const conditionsL = [];
      conditionsL.push(...buildLeadYearWhere(year, paramsL));
      conditionsL.push("l.reference IS NOT NULL AND l.reference != ''");
      conditionsL.push(`${TYPE_KEY_SQL_FARM_LEADS} IS NOT NULL`);
      const whereL = conditionsL.length ? `WHERE ${conditionsL.join(" AND ")}` : "";

      const [orderRows] = await db.execute(
        `
        SELECT
          o.reference AS name,
          COUNT(*) AS orderCount,
          COALESCE(SUM(o.total_amount), 0) AS totalRevenueGenerated
        FROM orders o
        ${whereO}
        GROUP BY o.reference
        `,
        paramsO
      );

      const [leadRows] = await db.execute(
        `
        SELECT l.reference AS name, COUNT(*) AS queryCount
        FROM leads l
        ${whereL}
        GROUP BY l.reference
        `,
        paramsL
      );

      const orderMap = new Map();
      for (const r of orderRows || []) {
        const orderCount = Number(r.orderCount || 0);
        orderMap.set(r.name, {
          orderCount,
          leadsConverted: orderCount,
          totalRevenueGenerated: Number(r.totalRevenueGenerated || 0),
        });
      }

      const leadMap = new Map();
      for (const r of leadRows || []) {
        leadMap.set(r.name, Number(r.queryCount || 0));
      }

      const allRefs = new Set([...orderMap.keys(), ...leadMap.keys()]);
      const data = [...allRefs].map((name) => {
        const o = orderMap.get(name) || {
          orderCount: 0,
          totalRevenueGenerated: 0,
        };
        const leadsConverted = o.orderCount;
        const queryCount = leadMap.get(name) || 0;
        const leadsGenerated = o.orderCount + queryCount;
        const conversionRate = leadsGenerated > 0 ? (leadsConverted / leadsGenerated) * 100 : 0;
        return {
          name,
          leadsGenerated,
          leadsConverted,
          totalRevenueGenerated: o.totalRevenueGenerated,
          conversionRate,
        };
      });

      data.sort((a, b) => (b.leadsGenerated - a.leadsGenerated));
      res.json({ references: data });
    } catch (e) {
      logError("FARM", "Reference-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // Farm Dashboard Source-wise
  // -----------------------
  app.get("/api/farm/dashboard/source-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildOrderYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      conditions.push("(o.order_source IS NOT NULL AND o.order_source != '')");
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          o.order_source AS sourceName,
          COUNT(*) AS count
        FROM orders o
        ${where}
        GROUP BY o.order_source
        ORDER BY count DESC
        `,
        params
      );

      const sources = (rows || []).map((r) => ({
        sourceName: r.sourceName || "—",
        count: Number(r.count || 0),
      }));

      res.json({ sources });
    } catch (e) {
      logError("FARM", "Source-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // Farm Dashboard Sales Overview
  // -----------------------
  app.get("/api/farm/dashboard/sales-overview", verifyToken, async (req, res) => {
    try {
      const { year = "2026" } = req.query;
      const params = [];
      const conditions = buildOrderYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      conditions.push("o.booking_date IS NOT NULL");
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          DATE(o.booking_date) AS date,
          COUNT(*) AS orders,
          COALESCE(SUM(o.total_amount), 0) AS totalSales,
          COALESCE(SUM(o.received_amount), 0) AS receivedPayments,
          COALESCE(SUM(o.pending_amount), 0) AS pendingPayments
        FROM orders o
        ${where}
        GROUP BY DATE(o.booking_date)
        ORDER BY date ASC
        `,
        params
      );

      const series = (rows || []).map((r) => {
        const orders = Number(r.orders || 0);
        const totalSales = Number(r.totalSales || 0);
        return {
          date: r.date ? String(r.date).slice(0, 10) : "",
          orders,
          totalSales,
          receivedPayments: Number(r.receivedPayments || 0),
          pendingPayments: Number(r.pendingPayments || 0),
          totalQuantity: orders,
          avgOrderValue: orders > 0 ? Math.round(totalSales / orders) : 0,
        };
      });

      res.json({ series });
    } catch (e) {
      logError("FARM", "Sales overview error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // Farm Transactions (2026, Farm orders + farm_expenses — mirrors booking transactions logic)
  // -----------------------
  app.get("/api/farm/transactions", verifyToken, async (req, res) => {
    try {
      const [paySum] = await db.execute(
        `SELECT COALESCE(SUM(p.bank), 0) AS total_bank, COALESCE(SUM(p.cash), 0) AS total_cash
         FROM payments p
         INNER JOIN orders o ON o.order_id = p.order_id
         WHERE TRIM(COALESCE(o.order_source, '')) = 'Farm'
           AND o.order_type IN ('Cow', 'Goat')
           AND YEAR(o.booking_date) = 2026`
      );
      const [expSum] = await db.execute(
        `SELECT COALESCE(SUM(bank), 0) AS expenses_bank, COALESCE(SUM(cash), 0) AS expenses_cash
         FROM farm_expenses
         WHERE YEAR(done_at) = 2026`
      );
      const totalBank = Number(paySum[0]?.total_bank ?? 0);
      const totalCash = Number(paySum[0]?.total_cash ?? 0);
      const totalExpensesBank = Number(expSum[0]?.expenses_bank ?? 0);
      const totalExpensesCash = Number(expSum[0]?.expenses_cash ?? 0);
      const onHand = totalBank - totalExpensesBank;
      const actual = totalCash - totalExpensesCash;
      const totalAmount = totalBank + totalCash;
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
      });
    } catch (e) {
      logError("FARM", "Transactions summary error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  /** Bank/cash received on Farm Cow/Goat orders (booking_date year 2026) — for Transactions amount cards */
  app.get("/api/farm/orders/summary", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT COALESCE(SUM(p.bank), 0) AS total_bank, COALESCE(SUM(p.cash), 0) AS total_cash
         FROM orders o
         LEFT JOIN (
           SELECT order_id, SUM(bank) AS bank, SUM(cash) AS cash FROM payments GROUP BY order_id
         ) p ON o.order_id = p.order_id
         WHERE TRIM(COALESCE(o.order_source, '')) = 'Farm'
           AND o.order_type IN ('Cow', 'Goat')
           AND YEAR(o.booking_date) = 2026`
      );
      res.json({
        totalBank: Number(rows[0]?.total_bank ?? 0),
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (e) {
      logError("FARM", "Orders summary error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // Farm Expenses (CRUD)
  // -----------------------
  app.get("/api/farm/expenses/summary", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        "SELECT COALESCE(SUM(bank), 0) AS total_bank, COALESCE(SUM(cash), 0) AS total_cash FROM farm_expenses"
      );
      res.json({
        totalBank: Number(rows[0]?.total_bank ?? 0),
        totalCash: Number(rows[0]?.total_cash ?? 0),
      });
    } catch (e) {
      logError("FARM", "Expenses summary error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/farm/expenses", verifyToken, async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * limitNum;
      const [countRows] = await db.execute("SELECT COUNT(*) AS total FROM farm_expenses");
      const total = Number(countRows[0]?.total ?? 0);
      const [rows] = await db.execute(
        `SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM farm_expenses ORDER BY done_at DESC ${limitOffsetClause(limitNum, offset, { maxLimit: 100, defaultLimit: 50 })}`
      );
      const expenses = (rows || []).map((r) => ({ ...r, done_at: toDateOnly(r.done_at) ?? r.done_at }));
      res.json({ data: expenses, total });
    } catch (e) {
      logError("FARM", "Expenses list error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/farm/expenses", verifyToken, async (req, res) => {
    try {
      let { bank = 0, cash = 0, description = "", done_by = null, done_at = null } = req.body || {};

      const addBank = Math.max(0, Number(bank) || 0);
      const addCash = Math.max(0, Number(cash) || 0);

      if (addBank === 0 && addCash === 0) {
        return res.status(400).json({ message: "Add at least one of bank or cash amount" });
      }

      const total = addBank + addCash;

      description = String(description || "").trim() || null;
      done_by = done_by ? String(done_by).trim() : null;

      if (done_at) {
        const d = new Date(done_at);
        if (isNaN(d.getTime())) done_at = null;
        else done_at = d.toISOString().split("T")[0];
      } else {
        done_at = null;
      }

      const year = new Date().getFullYear();

      const [userRows] = await db.execute("SELECT username FROM users WHERE user_id = ?", [req.userId]);
      const username = userRows[0]?.username ?? String(req.userId);

      const [idRows] = await db.execute(
        `SELECT COALESCE(
          MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0
        ) + 1 AS nextId
        FROM farm_expenses
        WHERE expense_id LIKE 'E-%'`
      );

      const nextId = idRows[0]?.nextId ?? 1;
      const expenseId = `E-${String(nextId).padStart(4, "0")}-${year}`;

      await db.execute(
        `
        INSERT INTO farm_expenses
          (expense_id, bank, cash, total, description, done_by, done_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [expenseId, addBank, addCash, total, description, done_by || username, done_at, req.userId]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ADD_EXPENSE",
        entity_type: "farm_expenses",
        entity_id: expenseId,
        new_values: {
          bank: addBank,
          cash: addCash,
          total,
          description,
          done_by: done_by || username,
          done_at,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("FARM", "Expense added", { user_id: req.userId, expenseId });
      res.json({ message: "Expense added", expense_id: expenseId });
    } catch (e) {
      logError("FARM", "Add expense error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/farm/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      let { bank, cash, description, done_by = null, done_at = null } = req.body || {};

      const newBank = Math.max(0, Number(bank) || 0);
      const newCash = Math.max(0, Number(cash) || 0);

      if (newBank === 0 && newCash === 0) {
        return res.status(400).json({ message: "At least one of bank or cash must be greater than 0" });
      }

      const total = newBank + newCash;
      description = String(description ?? "").trim() || null;
      done_by = done_by ? String(done_by).trim() || null : null;

      if (done_at) {
        const d = new Date(done_at);
        done_at = isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      } else {
        done_at = null;
      }

      const [existing] = await db.execute(
        "SELECT expense_id, bank, cash, total, description, done_by, done_at FROM farm_expenses WHERE expense_id = ?",
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
        done_at: oldRow.done_at,
      };

      await db.execute(
        `
        UPDATE farm_expenses
        SET bank = ?, cash = ?, total = ?, description = ?, done_by = ?, done_at = ?
        WHERE expense_id = ?
        `,
        [newBank, newCash, total, description, done_by, done_at, expenseId]
      );

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "UPDATE_EXPENSE",
        entity_type: "farm_expenses",
        entity_id: expenseId,
        old_values: previousState,
        new_values: {
          expense_id: expenseId,
          bank: newBank,
          cash: newCash,
          total,
          description,
          done_by,
          done_at,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("FARM", "Expense updated", { user_id: req.userId, expenseId });
      res.json({ message: "Expense updated", expense_id: expenseId });
    } catch (e) {
      logError("FARM", "Update expense error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/farm/expenses/next-id", verifyToken, async (req, res) => {
    try {
      const year = new Date().getFullYear();
      const [rows] = await db.execute(
        `
        SELECT COALESCE(
          MAX(CAST(SUBSTRING(expense_id, 3, 4) AS UNSIGNED)), 0
        ) + 1 AS nextId
        FROM farm_expenses
        WHERE expense_id LIKE 'E-%'
        `
      );
      const nextId = rows[0]?.nextId ?? 1;
      const expenseId = `E-${String(nextId).padStart(4, "0")}-${year}`;
      res.json({ expense_id: expenseId });
    } catch (e) {
      logError("FARM", "Next expense id error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/farm/expenses/:expenseId", verifyToken, async (req, res) => {
    try {
      const { expenseId } = req.params;
      const [existing] = await db.execute(
        "SELECT expense_id, bank, cash, total, done_at, description, done_by, created_by FROM farm_expenses WHERE expense_id = ?",
        [expenseId]
      );
      if (existing.length === 0) return res.status(404).json({ message: "Expense not found" });

      const row = existing[0];
      const previousState = {
        expense_id: row.expense_id,
        bank: row.bank,
        cash: row.cash,
        total: row.total,
        done_at: toDateOnly(row.done_at) ?? row.done_at,
        description: row.description,
        done_by: row.done_by,
      };

      await db.execute("DELETE FROM farm_expenses WHERE expense_id = ?", [expenseId]);

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "DELETE_EXPENSE",
        entity_type: "farm_expenses",
        entity_id: expenseId,
        old_values: previousState,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("FARM", "Expense deleted", { user_id: req.userId, expenseId });
      res.json({ message: "Expense deleted", expense_id: expenseId });
    } catch (e) {
      logError("FARM", "Delete expense error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/farm/expenses/export-audit", verifyToken, async (req, res) => {
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
        entity_type: "farm_expenses",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("FARM", "Expenses export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (e) {
      logError("FARM", "Expenses export audit error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
};

