import { logError } from "../utils/logger.js";
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

function buildPaymentYearWhere(year, params) {
  const conditions = [];
  if (year === "2026" || year === "2025") {
    conditions.push("YEAR(p.date) = ?");
    params.push(year);
  } else if (year === "2024") {
    conditions.push("(p.date IS NULL OR YEAR(p.date) < 2025)");
  }
  return conditions;
}

function buildExpenseYearWhere(year, params, col = "e.done_at") {
  const conditions = [];
  if (year === "2026" || year === "2025") {
    conditions.push(`YEAR(${col}) = ?`);
    params.push(year);
  } else if (year === "2024") {
    conditions.push(`(${col} IS NULL OR YEAR(${col}) < 2025)`);
  }
  return conditions;
}

/** Booking 4 types + farm Cow / Goat (excludes Goat Hissa from farm bucket) */
const ACCOUNTING_TYPE_KEY_SQL = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa') THEN 'goat'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('cow','fullcow','fancycow') THEN 'cow'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goat') THEN 'farm_goat'
    ELSE NULL
  END
`;

const DAY_KEY_SQL = `
  CASE
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day1','1') THEN 'day1'
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day2','2') THEN 'day2'
    WHEN REPLACE(LOWER(o.day),' ','') IN ('day3','3') THEN 'day3'
    ELSE NULL
  END
`;

const TYPE_KEY_SQL_BOOKING = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissapremium') THEN 'premium'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissastandard') THEN 'standard'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('hissawaqf') THEN 'waqf'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goathissa') THEN 'goat'
    ELSE NULL
  END
`;

const TYPE_KEY_SQL_FARM_ORDERS = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('cow','fullcow','fancycow') THEN 'cow'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(o.order_type),' ',''),'-',''),'(',''),')','') IN ('goat') THEN 'goat'
    ELSE NULL
  END
`;

const TYPE_KEY_SQL_FARM_LEADS = `
  CASE
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('cow','fullcow','fancycow') THEN 'cow'
    WHEN REPLACE(REPLACE(REPLACE(REPLACE(LOWER(l.order_type),' ',''),'-',''),'(',''),')','') IN ('goat') THEN 'goat'
    ELSE NULL
  END
`;

const PAYMENT_SOURCE_SQL = `
  CASE
    WHEN ${ACCOUNTING_TYPE_KEY_SQL} IN ('cow', 'farm_goat') THEN 'Farm Management'
    WHEN ${ACCOUNTING_TYPE_KEY_SQL} IS NOT NULL THEN 'Booking Management'
    ELSE 'Booking Management'
  END
`;

export const registerAccountingRoutes = (app, db, verifyToken) => {
  // --- Combined KPIs (booking 4 types + farm cow/goat) ---
  app.get("/api/accounting/dashboard/kpis", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;
      const params = [];
      const conditions = buildOrderYearWhere(year, params);
      conditions.push(`${ACCOUNTING_TYPE_KEY_SQL} IS NOT NULL`);
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
      logError("ACCOUNTING", "KPIs error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/dashboard/target-achievement", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;
      const params = [];
      const conditions = buildOrderYearWhere(year, params);
      conditions.push(`${ACCOUNTING_TYPE_KEY_SQL} IS NOT NULL`);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT ${ACCOUNTING_TYPE_KEY_SQL} AS typeKey, COUNT(*) AS cnt
        FROM orders o
        ${where}
        GROUP BY typeKey
        `,
        params
      );

      const map = { premium: 0, standard: 0, waqf: 0, goat: 0, cow: 0, farm_goat: 0 };
      for (const row of rows || []) {
        const k = row.typeKey ?? row.typekey;
        if (k && map[k] !== undefined) map[k] = Number(row.cnt || 0);
      }

      const achievedTotal = Object.values(map).reduce((a, b) => a + b, 0);
      const targetTotal = 2100;

      const breakdown = [
        { key: "premium", label: "Hissa - Premium", value: map.premium },
        { key: "standard", label: "Hissa - Standard", value: map.standard },
        { key: "waqf", label: "Hissa - Waqf", value: map.waqf },
        { key: "goat", label: "Goat (Hissa)", value: map.goat },
        { key: "cow", label: "Fancy Cow", value: map.cow },
        { key: "farm_goat", label: "Goat", value: map.farm_goat },
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
      logError("ACCOUNTING", "Target achievement error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/dashboard/day-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;
      const params = [];
      const conditions = buildOrderYearWhere(year, params);
      conditions.push(`${TYPE_KEY_SQL_BOOKING} IS NOT NULL`);
      conditions.push(`${DAY_KEY_SQL} IS NOT NULL`);
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `
        SELECT
          ${DAY_KEY_SQL} AS dayKey,
          ${TYPE_KEY_SQL_BOOKING} AS typeKey,
          COUNT(*) AS totalOrders,
          SUM(CASE WHEN COALESCE(o.pending_amount,0) = 0 THEN 1 ELSE 0 END) AS paymentCleared,
          SUM(CASE WHEN COALESCE(o.pending_amount,0) = COALESCE(o.total_amount,0) AND COALESCE(o.total_amount,0) > 0 THEN 1 ELSE 0 END) AS pendingCompletely,
          SUM(CASE WHEN COALESCE(o.pending_amount,0) > 0 AND COALESCE(o.pending_amount,0) < COALESCE(o.total_amount,0) THEN 1 ELSE 0 END) AS pendingPartially
        FROM orders o
        ${where}
        GROUP BY dayKey, typeKey
        `,
        params
      );

      const emptyDay = () => ({ premium: 0, standard: 0, waqf: 0, goat: 0 });

      const base = {
        day1: { title: "DAY 1", rows: { totalOrders: emptyDay(), paymentCleared: emptyDay(), pendingCompletely: emptyDay(), pendingPartially: emptyDay() } },
        day2: { title: "DAY 2", rows: { totalOrders: emptyDay(), paymentCleared: emptyDay(), pendingCompletely: emptyDay(), pendingPartially: emptyDay() } },
        day3: { title: "DAY 3", rows: { totalOrders: emptyDay(), paymentCleared: emptyDay(), pendingCompletely: emptyDay(), pendingPartially: emptyDay() } },
      };

      for (const r of rows || []) {
        const d = r.dayKey ?? r.daykey ?? null;
        const t = r.typeKey ?? r.typekey ?? null;
        if (!d || !t || !base[d]?.rows?.totalOrders || base[d].rows.totalOrders[t] === undefined) continue;
        base[d].rows.totalOrders[t] = Number(r.totalOrders ?? r.totalorders ?? 0);
        base[d].rows.paymentCleared[t] = Number(r.paymentCleared ?? r.paymentcleared ?? 0);
        base[d].rows.pendingCompletely[t] = Number(r.pendingCompletely ?? r.pendingcompletely ?? 0);
        base[d].rows.pendingPartially[t] = Number(r.pendingPartially ?? r.pendingpartially ?? 0);
      }

      const sum = (obj) => Object.values(obj).reduce((a, b) => a + Number(b || 0), 0);

      const toCard = (dkey) => {
        const d = base[dkey];
        return {
          key: dkey,
          title: d.title,
          columnKeys: ["premium", "standard", "waqf", "goat"],
          columns: ["Premium", "Standard", "Waqf", "Goat (Hissa)", "Total"],
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
      logError("ACCOUNTING", "Day-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/dashboard/reference-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const mergeRefMaps = (bookingList, farmList) => {
        const byName = new Map();
        for (const x of bookingList) {
          byName.set(x.name, { ...x });
        }
        for (const x of farmList) {
          const cur = byName.get(x.name) || {
            name: x.name,
            leadsGenerated: 0,
            leadsConverted: 0,
            totalRevenueGenerated: 0,
            conversionRate: 0,
          };
          cur.leadsGenerated += x.leadsGenerated;
          cur.leadsConverted += x.leadsConverted;
          cur.totalRevenueGenerated += x.totalRevenueGenerated;
          const conv = cur.leadsGenerated > 0 ? (cur.leadsConverted / cur.leadsGenerated) * 100 : 0;
          cur.conversionRate = conv;
          byName.set(x.name, cur);
        }
        return [...byName.values()].sort((a, b) => b.leadsGenerated - a.leadsGenerated);
      };

      const bookingParamsO = [];
      const bookingCondO = buildOrderYearWhere(year, bookingParamsO);
      bookingCondO.push(`${TYPE_KEY_SQL_BOOKING} IS NOT NULL`);
      bookingCondO.push("o.closed_by IS NOT NULL AND o.closed_by != ''");
      const whereBO = bookingCondO.length ? `WHERE ${bookingCondO.join(" AND ")}` : "";

      const bookingParamsL = [];
      const bookingCondL = [];
      if (year === "2026" || year === "2025") {
        bookingCondL.push("YEAR(l.created_at) = ?");
        bookingParamsL.push(year);
      } else if (year === "2024") {
        bookingCondL.push("(l.created_at IS NULL OR YEAR(l.created_at) < 2025)");
      }
      bookingCondL.push("l.reference IS NOT NULL AND l.reference != ''");
      const whereBL = bookingCondL.length ? `WHERE ${bookingCondL.join(" AND ")}` : "";

      const [orderRowsB] = await db.execute(
        `SELECT o.closed_by AS name, COUNT(*) AS orderCount, COALESCE(SUM(o.total_amount), 0) AS totalRevenueGenerated
         FROM orders o ${whereBO} GROUP BY o.closed_by`,
        bookingParamsO
      );
      const [leadRowsB] = await db.execute(
        `SELECT l.reference AS name, COUNT(*) AS queryCount FROM leads l ${whereBL} GROUP BY l.reference`,
        bookingParamsL
      );

      const orderMapB = new Map();
      for (const r of orderRowsB || []) {
        const orderCount = Number(r.orderCount || 0);
        orderMapB.set(r.name, { orderCount, leadsConverted: orderCount, totalRevenueGenerated: Number(r.totalRevenueGenerated || 0) });
      }
      const leadMapB = new Map();
      for (const r of leadRowsB || []) leadMapB.set(r.name, Number(r.queryCount || 0));

      const bookingRefs = [...orderMapB.keys()].map((name) => {
        const o = orderMapB.get(name);
        const queryCount = leadMapB.get(name) || 0;
        const leadsGenerated = o.orderCount + queryCount;
        const conversionRate = leadsGenerated > 0 ? (o.leadsConverted / leadsGenerated) * 100 : 0;
        return {
          name,
          leadsGenerated,
          leadsConverted: o.leadsConverted,
          totalRevenueGenerated: o.totalRevenueGenerated,
          conversionRate,
        };
      });

      const farmParamsO = [];
      const farmCondO = buildOrderYearWhere(year, farmParamsO);
      farmCondO.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      farmCondO.push("o.reference IS NOT NULL AND o.reference != ''");
      const whereFO = farmCondO.length ? `WHERE ${farmCondO.join(" AND ")}` : "";

      const farmParamsL = [];
      const farmCondL = [];
      if (year === "2026" || year === "2025") {
        farmCondL.push("YEAR(l.created_at) = ?");
        farmParamsL.push(year);
      } else if (year === "2024") {
        farmCondL.push("(l.created_at IS NULL OR YEAR(l.created_at) < 2025)");
      }
      farmCondL.push("l.reference IS NOT NULL AND l.reference != ''");
      farmCondL.push(`${TYPE_KEY_SQL_FARM_LEADS} IS NOT NULL`);
      const whereFL = farmCondL.length ? `WHERE ${farmCondL.join(" AND ")}` : "";

      const [orderRowsF] = await db.execute(
        `SELECT o.reference AS name, COUNT(*) AS orderCount, COALESCE(SUM(o.total_amount), 0) AS totalRevenueGenerated
         FROM orders o ${whereFO} GROUP BY o.reference`,
        farmParamsO
      );
      const [leadRowsF] = await db.execute(
        `SELECT l.reference AS name, COUNT(*) AS queryCount FROM leads l ${whereFL} GROUP BY l.reference`,
        farmParamsL
      );

      const orderMapF = new Map();
      for (const r of orderRowsF || []) {
        const orderCount = Number(r.orderCount || 0);
        orderMapF.set(r.name, { orderCount, leadsConverted: orderCount, totalRevenueGenerated: Number(r.totalRevenueGenerated || 0) });
      }
      const leadMapF = new Map();
      for (const r of leadRowsF || []) leadMapF.set(r.name, Number(r.queryCount || 0));

      const farmRefs = [...new Set([...orderMapF.keys(), ...leadMapF.keys()])].map((name) => {
        const o = orderMapF.get(name) || { orderCount: 0, totalRevenueGenerated: 0 };
        const leadsConverted = o.orderCount;
        const queryCount = leadMapF.get(name) || 0;
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

      res.json({ references: mergeRefMaps(bookingRefs, farmRefs) });
    } catch (e) {
      logError("ACCOUNTING", "Reference-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/dashboard/source-wise", verifyToken, async (req, res) => {
    try {
      const { year = "all" } = req.query;

      const paramsB = [];
      const condB = buildOrderYearWhere(year, paramsB);
      condB.push(`${TYPE_KEY_SQL_BOOKING} IS NOT NULL`);
      condB.push("(o.order_source IS NOT NULL AND o.order_source != '')");
      const whereB = condB.length ? `WHERE ${condB.join(" AND ")}` : "";

      const paramsF = [];
      const condF = buildOrderYearWhere(year, paramsF);
      condF.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      condF.push("(o.order_source IS NOT NULL AND o.order_source != '')");
      const whereF = condF.length ? `WHERE ${condF.join(" AND ")}` : "";

      const [rowsB] = await db.execute(
        `SELECT o.order_source AS sourceName, COUNT(*) AS count FROM orders o ${whereB} GROUP BY o.order_source`,
        paramsB
      );
      const [rowsF] = await db.execute(
        `SELECT o.order_source AS sourceName, COUNT(*) AS count FROM orders o ${whereF} GROUP BY o.order_source`,
        paramsF
      );

      const merged = new Map();
      for (const r of [...(rowsB || []), ...(rowsF || [])]) {
        const name = r.sourceName || "—";
        merged.set(name, (merged.get(name) || 0) + Number(r.count || 0));
      }
      const sources = [...merged.entries()]
        .map(([sourceName, count]) => ({ sourceName, count }))
        .sort((a, b) => b.count - a.count);

      res.json({ sources });
    } catch (e) {
      logError("ACCOUNTING", "Source-wise error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/dashboard/sales-overview", verifyToken, async (req, res) => {
    try {
      const { year = "2026" } = req.query;

      const paramsB = [];
      const condB = buildOrderYearWhere(year, paramsB);
      condB.push(`${TYPE_KEY_SQL_BOOKING} IS NOT NULL`);
      condB.push("o.booking_date IS NOT NULL");
      const whereB = condB.length ? `WHERE ${condB.join(" AND ")}` : "";

      const paramsF = [];
      const condF = buildOrderYearWhere(year, paramsF);
      condF.push(`${TYPE_KEY_SQL_FARM_ORDERS} IS NOT NULL`);
      condF.push("o.booking_date IS NOT NULL");
      const whereF = condF.length ? `WHERE ${condF.join(" AND ")}` : "";

      const [rowsB] = await db.execute(
        `SELECT DATE(o.booking_date) AS date, COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS totalSales,
                COALESCE(SUM(o.received_amount), 0) AS receivedPayments, COALESCE(SUM(o.pending_amount), 0) AS pendingPayments
         FROM orders o ${whereB} GROUP BY DATE(o.booking_date)`,
        paramsB
      );
      const [rowsF] = await db.execute(
        `SELECT DATE(o.booking_date) AS date, COUNT(*) AS orders, COALESCE(SUM(o.total_amount), 0) AS totalSales,
                COALESCE(SUM(o.received_amount), 0) AS receivedPayments, COALESCE(SUM(o.pending_amount), 0) AS pendingPayments
         FROM orders o ${whereF} GROUP BY DATE(o.booking_date)`,
        paramsF
      );

      const byDate = new Map();
      for (const r of [...(rowsB || []), ...(rowsF || [])]) {
        const d = r.date ? String(r.date).slice(0, 10) : "";
        if (!d) continue;
        const cur = byDate.get(d) || { orders: 0, totalSales: 0, receivedPayments: 0, pendingPayments: 0 };
        cur.orders += Number(r.orders || 0);
        cur.totalSales += Number(r.totalSales || 0);
        cur.receivedPayments += Number(r.receivedPayments || 0);
        cur.pendingPayments += Number(r.pendingPayments || 0);
        byDate.set(d, cur);
      }

      const series = [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, v]) => {
          const orders = v.orders;
          const totalSales = v.totalSales;
          return {
            date,
            orders,
            totalSales,
            receivedPayments: v.receivedPayments,
            pendingPayments: v.pendingPayments,
            totalQuantity: orders,
            avgOrderValue: orders > 0 ? Math.round(totalSales / orders) : 0,
          };
        });

      res.json({ series });
    } catch (e) {
      logError("ACCOUNTING", "Sales overview error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/payments/filters", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT DISTINCT o.order_type AS order_type FROM payments p
         INNER JOIN orders o ON o.order_id = p.order_id
         WHERE o.order_type IS NOT NULL AND o.order_type != ''
         ORDER BY o.order_type ASC`
      );
      res.json({ order_types: (rows || []).map((r) => r.order_type).filter(Boolean) });
    } catch (e) {
      logError("ACCOUNTING", "Payment filters error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/payments", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const source = req.query.source;
      const orderTypes = []
        .concat(req.query.order_type || [])
        .concat(req.query["order_type[]"] || [])
        .flat()
        .filter(Boolean);

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = (page - 1) * limit;

      const params = [];
      const conditions = ["p.order_id IS NOT NULL"];
      conditions.push(...buildPaymentYearWhere(year, params));

      if (source === "farm" || source === "Farm Management") {
        conditions.push(`${PAYMENT_SOURCE_SQL} = 'Farm Management'`);
      } else if (source === "booking" || source === "Booking Management") {
        conditions.push(`${PAYMENT_SOURCE_SQL} = 'Booking Management'`);
      }

      if (orderTypes.length > 0) {
        const ph = orderTypes.map(() => "?").join(",");
        conditions.push(`o.order_type IN (${ph})`);
        params.push(...orderTypes);
      }

      if (search) {
        const like = `%${search.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
        conditions.push(
          `(o.customer_id LIKE ? OR o.order_id LIKE ? OR o.booking_name LIKE ? OR o.contact LIKE ? OR o.shareholder_name LIKE ? OR p.payment_id LIKE ? OR CAST(p.total_received AS CHAR) LIKE ?)`
        );
        params.push(like, like, like, like, like, like, like);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const countSql = `
        SELECT COUNT(*) AS c FROM payments p
        INNER JOIN orders o ON o.order_id = p.order_id
        ${where}
      `;
      const [countRows] = await db.execute(countSql, params);
      const total = Number(countRows?.[0]?.c || 0);

      const dataSql = `
        SELECT
          p.payment_id,
          p.bank,
          p.cash,
          p.total_received,
          p.date AS payment_date,
          o.order_id,
          o.customer_id,
          o.booking_name,
          o.contact,
          o.order_type,
          ${PAYMENT_SOURCE_SQL} AS source
        FROM payments p
        INNER JOIN orders o ON o.order_id = p.order_id
        ${where}
        ORDER BY p.date DESC, p.payment_id DESC
        ${limitOffsetClause(limit, offset)}
      `;
      const [dataRows] = await db.execute(dataSql, params);

      const data = (dataRows || []).map((r) => ({
        payment_id: r.payment_id,
        bank: Number(r.bank || 0),
        cash: Number(r.cash || 0),
        total_received: Number(r.total_received || 0),
        payment_date: toDateOnly(r.payment_date) ?? r.payment_date,
        order_id: r.order_id,
        customer_id: r.customer_id,
        booking_name: r.booking_name,
        contact: r.contact,
        order_type: r.order_type,
        source: r.source,
      }));

      res.json({ data, total, page, limit });
    } catch (e) {
      logError("ACCOUNTING", "Payments list error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/payments/summary", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const source = req.query.source;
      const orderTypes = []
        .concat(req.query.order_type || [])
        .concat(req.query["order_type[]"] || [])
        .flat()
        .filter(Boolean);

      const params = [];
      const conditions = ["p.order_id IS NOT NULL"];
      conditions.push(...buildPaymentYearWhere(year, params));

      if (source === "farm" || source === "Farm Management") {
        conditions.push(`${PAYMENT_SOURCE_SQL} = 'Farm Management'`);
      } else if (source === "booking" || source === "Booking Management") {
        conditions.push(`${PAYMENT_SOURCE_SQL} = 'Booking Management'`);
      }

      if (orderTypes.length > 0) {
        const ph = orderTypes.map(() => "?").join(",");
        conditions.push(`o.order_type IN (${ph})`);
        params.push(...orderTypes);
      }

      if (search) {
        const like = `%${search.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
        conditions.push(
          `(o.customer_id LIKE ? OR o.order_id LIKE ? OR o.booking_name LIKE ? OR o.contact LIKE ? OR o.shareholder_name LIKE ? OR p.payment_id LIKE ? OR CAST(p.total_received AS CHAR) LIKE ?)`
        );
        params.push(like, like, like, like, like, like, like);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await db.execute(
        `SELECT COALESCE(SUM(p.bank),0) AS total_bank, COALESCE(SUM(p.cash),0) AS total_cash
         FROM payments p INNER JOIN orders o ON o.order_id = p.order_id ${where}`,
        params
      );
      const r = rows?.[0] || {};
      res.json({ totalBank: Number(r.total_bank || 0), totalCash: Number(r.total_cash || 0) });
    } catch (e) {
      logError("ACCOUNTING", "Payments summary error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/expenses/filters", verifyToken, async (req, res) => {
    res.json({ sources: ["Booking Management", "Farm Management"] });
  });

  app.get("/api/accounting/expenses", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const source = req.query.source;

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
      const offset = (page - 1) * limit;

      const branches = [];

      if (!source || source === "Booking Management" || source === "booking") {
        const params = [];
        const cond = buildExpenseYearWhere(year, params, "e.done_at");
        const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
        let searchCond = "";
        if (search) {
          const like = `%${search.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
          searchCond = ` AND (e.expense_id LIKE ? OR e.description LIKE ? OR e.done_by LIKE ? OR CAST(e.bank AS CHAR) LIKE ? OR CAST(e.cash AS CHAR) LIKE ?)`;
          params.push(like, like, like, like, like);
        }
        branches.push({
          sql: `SELECT e.expense_id, e.bank, e.cash, e.total, e.done_at, e.description, e.done_by, e.created_by,
                       'Booking Management' AS source FROM booking_expenses e ${where}${searchCond}`,
          params: [...params],
        });
      }

      if (!source || source === "Farm Management" || source === "farm") {
        const params = [];
        const cond = buildExpenseYearWhere(year, params, "e.done_at");
        const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
        let searchCond = "";
        if (search) {
          const like = `%${search.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
          searchCond = ` AND (e.expense_id LIKE ? OR e.description LIKE ? OR e.done_by LIKE ? OR CAST(e.bank AS CHAR) LIKE ? OR CAST(e.cash AS CHAR) LIKE ?)`;
          params.push(like, like, like, like, like);
        }
        branches.push({
          sql: `SELECT e.expense_id, e.bank, e.cash, e.total, e.done_at, e.description, e.done_by, e.created_by,
                       'Farm Management' AS source FROM farm_expenses e ${where}${searchCond}`,
          params: [...params],
        });
      }

      if (branches.length === 0) {
        return res.json({ data: [], total: 0, page, limit });
      }

      const unionSql = branches.map((b) => `(${b.sql})`).join(" UNION ALL ");
      const countSql = `SELECT COUNT(*) AS c FROM (${unionSql}) u`;
      const countParams = branches.flatMap((b) => b.params);
      const [countRows] = await db.execute(countSql, countParams);
      const total = Number(countRows?.[0]?.c || 0);

      const dataSql = `SELECT * FROM (${unionSql}) u ORDER BY u.done_at DESC, u.expense_id DESC ${limitOffsetClause(limit, offset)}`;
      const [dataRows] = await db.execute(dataSql, countParams);

      const data = (dataRows || []).map((r) => ({
        expense_id: r.expense_id,
        bank: Number(r.bank || 0),
        cash: Number(r.cash || 0),
        total: Number(r.total || 0),
        done_at: toDateOnly(r.done_at) ?? r.done_at,
        description: r.description,
        done_by: r.done_by,
        created_by: r.created_by,
        source: r.source,
      }));

      res.json({ data, total, page, limit });
    } catch (e) {
      logError("ACCOUNTING", "Expenses list error", e);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.get("/api/accounting/expenses/summary", verifyToken, async (req, res) => {
    try {
      const year = req.query.year || "all";
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const source = req.query.source;

      let totalBank = 0;
      let totalCash = 0;

      const sumTable = async (table, label) => {
        if (source === "Booking Management" || source === "booking") {
          if (label !== "Booking Management") return;
        } else if (source === "Farm Management" || source === "farm") {
          if (label !== "Farm Management") return;
        }

        const params = [];
        const cond = buildExpenseYearWhere(year, params, "e.done_at");
        const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
        let searchCond = "";
        if (search) {
          const like = `%${search.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
          searchCond = ` AND (e.expense_id LIKE ? OR e.description LIKE ? OR e.done_by LIKE ? OR CAST(e.bank AS CHAR) LIKE ? OR CAST(e.cash AS CHAR) LIKE ?)`;
          params.push(like, like, like, like, like);
        }
        const [rows] = await db.execute(
          `SELECT COALESCE(SUM(e.bank),0) AS b, COALESCE(SUM(e.cash),0) AS c FROM ${table} e ${where}${searchCond}`,
          params
        );
        const r = rows?.[0] || {};
        totalBank += Number(r.b || 0);
        totalCash += Number(r.c || 0);
      };

      await sumTable("booking_expenses", "Booking Management");
      await sumTable("farm_expenses", "Farm Management");

      res.json({ totalBank, totalCash });
    } catch (e) {
      logError("ACCOUNTING", "Expenses summary error", e);
      res.status(500).json({ message: "Server error" });
    }
  });
};
