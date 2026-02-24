// server/routes/dashboard.js
import { logError } from "../utils/logger.js";

const TYPES = {
  premium: "Hissa - Premium",
  standard: "Hissa - Standard",
  waqf: "Hissa - Waqf",
  goat: "Goat (Hissa)",
};

/**
 * ✅ FIX:
 * Include orders with NULL booking_date for selected years
 * (matches your Booking APIs behavior).
 */
function buildYearWhere(year, params) {
  const conditions = [];

  if (year === "2026" || year === "2025") {
    conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) = ?)");
    params.push(year);
  } else if (year === "2024") {
    conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
  }

  // year === "all" => no filter
  return conditions;
}

// Normalize order_type in SQL so even if DB has "Hissa-Premium" or extra spaces, we still map correctly.
const TYPE_KEY_SQL = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa','goat') THEN 'goat'
    ELSE NULL
  END
`;

// Fixed day mapping to Day 1/2/3 (supports different casing/spaces)
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
  // ✅ Received Payments = SUM(orders.received_amount)
  // ✅ Cleared = pending_amount <= 0
  // -----------------------
  app.get("/api/dashboard/kpis", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);

      // Only the 4 types (by mapped key)
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          COUNT(*) AS totalOrders,

          -- ✅ cleared = pending_amount <= 0
          SUM(CASE WHEN COALESCE(o.pending_amount, 0) <= 0 THEN 1 ELSE 0 END) AS paymentClearedCount,

          SUM(CASE WHEN COALESCE(o.pending_amount, 0) > 0 THEN 1 ELSE 0 END) AS pendingPaymentsCount,

          COALESCE(SUM(o.total_amount), 0) AS totalSales,

          -- ✅ received payments from orders table
          COALESCE(SUM(COALESCE(o.received_amount, 0)), 0) AS receivedPayments,

          COALESCE(SUM(COALESCE(o.pending_amount, 0)), 0) AS pendingAmount
        FROM orders o
        ${where}
        `,
        params
      );

      const r = rows?.[0] || {};
      const totalOrders = Number(r.totalOrders || 0);
      const cleared = Number(r.paymentClearedCount || 0);

      const clearanceRate = totalOrders > 0 ? (cleared / totalOrders) * 100 : 0;

      res.json({
        kpis: {
          totalOrders,
          clearanceRate,
          pendingPaymentsCount: Number(r.pendingPaymentsCount || 0),
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
  // Donut + Progress bars (4 rows only)
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
      const targetTotal = 2000;

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
          remaining: Math.max(0, targetTotal - achievedTotal),
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

          SUM(CASE WHEN COALESCE(o.pending_amount,0) <= 0 THEN 1 ELSE 0 END) AS paymentCleared,

          SUM(CASE 
              WHEN COALESCE(o.received_amount,0) <= 0 AND COALESCE(o.pending_amount,0) > 0 THEN 1
              ELSE 0
          END) AS pendingCompletely,

          SUM(CASE 
              WHEN COALESCE(o.received_amount,0) > 0 AND COALESCE(o.pending_amount,0) > 0 THEN 1
              ELSE 0
          END) AS pendingPartially

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
        const d = r.dayKey;
        const t = r.typeKey;
        if (!base[d] || !base[d].rows || base[d].rows.totalOrders[t] === undefined) continue;

        base[d].rows.totalOrders[t] = Number(r.totalOrders || 0);
        base[d].rows.paymentCleared[t] = Number(r.paymentCleared || 0);
        base[d].rows.pendingCompletely[t] = Number(r.pendingCompletely || 0);
        base[d].rows.pendingPartially[t] = Number(r.pendingPartially || 0);
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
  // -----------------------
  app.get("/api/dashboard/reference-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const params = [];
      const conditions = buildYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL} IS NOT NULL`);
      conditions.push("o.reference IS NOT NULL AND o.reference != ''");

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          o.reference AS name,
          COUNT(*) AS leadsGenerated,
          SUM(CASE WHEN COALESCE(o.pending_amount,0) <= 0 THEN 1 ELSE 0 END) AS leadsConverted,
          COALESCE(SUM(o.total_amount), 0) AS totalRevenueGenerated
        FROM orders o
        ${where}
        GROUP BY o.reference
        ORDER BY leadsGenerated DESC
        `,
        params
      );

      const data = rows.map((r) => {
        const generated = Number(r.leadsGenerated || 0);
        const converted = Number(r.leadsConverted || 0);
        const conversionRate = generated > 0 ? (converted / generated) * 100 : 0;

        return {
          name: r.name,
          leadsGenerated: generated,
          leadsConverted: converted,
          totalRevenueGenerated: Number(r.totalRevenueGenerated || 0),
          conversionRate,
        };
      });

      res.json({ references: data });
    } catch (e) {
      logError("DASHBOARD", "Reference-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
};