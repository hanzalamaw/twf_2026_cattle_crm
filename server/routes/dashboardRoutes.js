// server/routes/dashboard.js
import { logError } from "../utils/logger.js";

const TYPES = {
  premium: "Hissa - Premium",
  standard: "Hissa - Standard",
  waqf: "Hissa - Waqf",
  goat: "Goat (Hissa)",
};

/**
 * ✅ Matches your booking APIs behavior:
 * - For 2026/2025: include YEAR(booking_date)=year
 * - For 2024: include booking_date IS NULL OR YEAR(booking_date) < 2025
 * - For all: no filter
 */
function buildYearWhere(year, params) {
  const conditions = [];

  if (year === "2026" || year === "2025") {
    conditions.push("YEAR(o.booking_date) = ?");
    params.push(year);
  } else if (year === "2024") {
    conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
  }

  return conditions;
}

/**
 * Normalize order_type in SQL so even if DB has different spacing/hyphens, we still map correctly.
 * NOTE: For donut/target/day-wise we only want the 4 types.
 */
const TYPE_KEY_SQL = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa') THEN 'goat'
    ELSE NULL
  END
`;

/**
 * Fixed day mapping to Day 1/2/3 (supports different casing/spaces)
 */
const DAY_KEY_SQL = `
  CASE
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day1','1') THEN 'day1'
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day2','2') THEN 'day2'
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day3','3') THEN 'day3'
    ELSE NULL
  END
`;

export const registerDashboardRoutes = (app, db, verifyToken) => {
  // -----------------------
  // GET: /api/dashboard/kpis?year=2026|2025|2024|all
  //
  // ✅ KPIs from 4 order types only: Hissa Premium, Standard, Waqf, Goat (Hissa)
  // ✅ Received Payments = SUM(orders.received_amount)
  // ✅ Cleared Orders = COUNT where pending_amount <= 0
  // ✅ Clearance Rate = clearedOrders / totalOrders * 100
  // -----------------------
  app.get("/api/dashboard/kpis", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);
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
      logError("DASHBOARD", "KPIs error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/target-achievement?year=...
  // Donut + Progress bars (ONLY 4 types)
  // -----------------------
  app.get("/api/dashboard/target-achievement", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          ${TYPE_KEY_SQL} AS typeKey,
          COUNT(*) AS cnt
        FROM orders o
        ${where}
        GROUP BY typeKey
        `,
        params
      );

      const map = { premium: 0, standard: 0, waqf: 0, goat: 0 };
      for (const row of rows) {
        if (row.typeKey && map[row.typeKey] !== undefined) {
          map[row.typeKey] = Number(row.cnt || 0);
        }
      }

      const achievedTotal = map.premium + map.standard + map.waqf + map.goat;
      const achievedForTarget = map.premium + map.standard + map.waqf;
      const targetTotal = year === "2024" ? 500 : year === "2025" ? 1000 : 2000;

      const breakdown = [
        { key: "premium", label: TYPES.premium, value: map.premium },
        { key: "standard", label: TYPES.standard, value: map.standard },
        { key: "waqf", label: TYPES.waqf, value: map.waqf },
        { key: "goat", label: TYPES.goat, value: map.goat },
      ].map((b) => ({
        ...b,
        percentage: achievedTotal > 0 ? (b.value / achievedTotal) * 100 : 0,
      }));

      res.json({
        target: {
          targetTotal,
          achievedTotal,
          achievedForTarget,
          remaining: Math.max(0, targetTotal - achievedForTarget),
        },
        breakdown,
      });
    } catch (e) {
      logError("DASHBOARD", "Target achievement error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/day-wise?year=...
  // Day 1/2/3 cards, columns: Premium Standard Waqf Goat Total
  // rows: Total Orders, Payment Cleared, Pending (Completely), Pending (Partially)
  // (ONLY 4 types)
  // -----------------------
  app.get("/api/dashboard/day-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);
      conditions.push(`${DAY_KEY_SQL} IS NOT NULL`);

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          ${DAY_KEY_SQL} AS dayKey,
          ${TYPE_KEY_SQL} AS typeKey,

          COUNT(*) AS totalOrders,

          -- Payment Cleared: pending is 0
          SUM(CASE WHEN COALESCE(o.pending_amount,0) = 0 THEN 1 ELSE 0 END) AS paymentCleared,
          -- Pending (Completely): pending = total amount (nothing paid)
          SUM(CASE WHEN COALESCE(o.pending_amount,0) = COALESCE(o.total_amount,0) AND COALESCE(o.total_amount,0) > 0 THEN 1 ELSE 0 END) AS pendingCompletely,
          -- Pending (Partially): some pending but less than total (some amount paid)
          SUM(CASE WHEN COALESCE(o.pending_amount,0) > 0 AND COALESCE(o.pending_amount,0) < COALESCE(o.total_amount,0) THEN 1 ELSE 0 END) AS pendingPartially

        FROM orders o
        ${where}
        GROUP BY dayKey, typeKey
        `,
        params
      );

      const emptyDay = () => ({
        premium: 0,
        standard: 0,
        waqf: 0,
        goat: 0,
      });

      const base = {
        day1: {
          title: "DAY 1",
          rows: {
            totalOrders: emptyDay(),
            paymentCleared: emptyDay(),
            pendingCompletely: emptyDay(),
            pendingPartially: emptyDay(),
          },
        },
        day2: {
          title: "DAY 2",
          rows: {
            totalOrders: emptyDay(),
            paymentCleared: emptyDay(),
            pendingCompletely: emptyDay(),
            pendingPartially: emptyDay(),
          },
        },
        day3: {
          title: "DAY 3",
          rows: {
            totalOrders: emptyDay(),
            paymentCleared: emptyDay(),
            pendingCompletely: emptyDay(),
            pendingPartially: emptyDay(),
          },
        },
      };

      for (const r of rows) {
        const d = r.dayKey ?? r.daykey ?? null;
        const t = r.typeKey ?? r.typekey ?? null;
        const totalOrders = Number(r.totalOrders ?? r.totalorders ?? 0);
        const paymentCleared = Number(r.paymentCleared ?? r.paymentcleared ?? 0);
        const pendingCompletely = Number(r.pendingCompletely ?? r.pendingcompletely ?? 0);
        const pendingPartially = Number(r.pendingPartially ?? r.pendingpartially ?? 0);

        if (!d || !t || !base[d] || !base[d].rows || base[d].rows.totalOrders[t] === undefined) continue;

        base[d].rows.totalOrders[t] = totalOrders;
        base[d].rows.paymentCleared[t] = paymentCleared;
        base[d].rows.pendingCompletely[t] = pendingCompletely;
        base[d].rows.pendingPartially[t] = pendingPartially;
      }

      const toCard = (dkey) => {
        const d = base[dkey];
        const sum = (obj) => Object.values(obj).reduce((a, b) => a + Number(b || 0), 0);

        return {
          key: dkey,
          title: d.title,
          columns: ["Premium", "Standard", "Waqf", "Goat", "Total"],
          data: [
            {
              label: "Total Orders",
              premium: d.rows.totalOrders.premium,
              standard: d.rows.totalOrders.standard,
              waqf: d.rows.totalOrders.waqf,
              goat: d.rows.totalOrders.goat,
              total: sum(d.rows.totalOrders),
            },
            {
              label: "Payment Cleared",
              premium: d.rows.paymentCleared.premium,
              standard: d.rows.paymentCleared.standard,
              waqf: d.rows.paymentCleared.waqf,
              goat: d.rows.paymentCleared.goat,
              total: sum(d.rows.paymentCleared),
            },
            {
              label: "Pending (Completely)",
              premium: d.rows.pendingCompletely.premium,
              standard: d.rows.pendingCompletely.standard,
              waqf: d.rows.pendingCompletely.waqf,
              goat: d.rows.pendingCompletely.goat,
              total: sum(d.rows.pendingCompletely),
            },
            {
              label: "Pending (Partially)",
              premium: d.rows.pendingPartially.premium,
              standard: d.rows.pendingPartially.standard,
              waqf: d.rows.pendingPartially.waqf,
              goat: d.rows.pendingPartially.goat,
              total: sum(d.rows.pendingPartially),
            },
          ],
        };
      };

      res.json({ days: [toCard("day1"), toCard("day2"), toCard("day3")] });
    } catch (e) {
      logError("DASHBOARD", "Day-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/reference-wise?year=...
  // Uses orders.closed_by as the primary grouping key.
  // Lead generated = orders with that closer + queries (leads) with same name in lead reference.
  // Lead converted = orders with that closer only.
  // -----------------------
  app.get("/api/dashboard/reference-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const paramsO = [];
      const conditionsO = buildYearWhere(year, paramsO);
      conditionsO.push(`${TYPE_KEY_SQL} IS NOT NULL`);
      conditionsO.push("o.closed_by IS NOT NULL AND o.closed_by != ''");
      const whereO = conditionsO.length ? `WHERE ${conditionsO.join(" AND ")}` : "";

      const paramsL = [];
      const conditionsL = [];
      if (year === "2026" || year === "2025") {
        conditionsL.push("YEAR(l.created_at) = ?");
        paramsL.push(year);
      } else if (year === "2024") {
        conditionsL.push("(l.created_at IS NULL OR YEAR(l.created_at) < 2025)");
      }
      conditionsL.push("l.reference IS NOT NULL AND l.reference != ''");
      const whereL = conditionsL.length ? `WHERE ${conditionsL.join(" AND ")}` : "";

      const [orderRows] = await db.execute(
        `
        SELECT
          o.closed_by AS name,
          COUNT(*) AS orderCount,
          COALESCE(SUM(o.total_amount), 0) AS totalRevenueGenerated
        FROM orders o
        ${whereO}
        GROUP BY o.closed_by
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

      // Keep names sourced from closed_by only.
      const data = [...orderMap.keys()].map((name) => {
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
      logError("DASHBOARD", "Reference-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/source-wise?year=...
  // Order count per order_source (for Source wise summary cards)
  // -----------------------
  app.get("/api/dashboard/source-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);
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
      logError("DASHBOARD", "Source-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  // -----------------------
  // GET: /api/dashboard/sales-overview?year=...
  // Daily series for line chart: date, orders, totalSales, receivedPayments, pendingPayments, totalQuantity, avgOrderValue
  // -----------------------
  app.get("/api/dashboard/sales-overview", verifyToken, async (req, res) => {
    try {
      const { year = "2026" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);
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
      logError("DASHBOARD", "Sales overview error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
};