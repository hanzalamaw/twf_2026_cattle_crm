// dashboardRoutes.js
import { logError } from "../utils/logger.js";

export const registerDashboardRoutes = (app, db, verifyToken) => {
  app.get("/api/dashboard/booking/summary", verifyToken, async (req, res) => {
    try {
      const year = String(req.query.year || "all");

      const conditions = [];
      const params = [];

      if (year === "2026" || year === "2025") {
        conditions.push("YEAR(o.booking_date) = ?");
        params.push(year);
      } else if (year === "2024") {
        conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) < 2025)");
      }
      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      // 1) KPI totals from orders
      const [kpiRows] = await db.execute(
        `
        SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(o.total_amount), 0) AS total_sales,
          COALESCE(SUM(o.received_amount), 0) AS received_payments,
          COALESCE(SUM(o.pending_amount), 0) AS pending_amount,
          SUM(CASE WHEN COALESCE(o.pending_amount,0) > 0 THEN 1 ELSE 0 END) AS pending_payments_count,
          SUM(CASE WHEN COALESCE(o.pending_amount,0) <= 0 THEN 1 ELSE 0 END) AS cleared_payments_count
        FROM orders o
        ${whereClause}
        `,
        params
      );

      const totals = kpiRows[0] || {};
      const totalOrders = Number(totals.total_orders || 0);
      const totalSales = Number(totals.total_sales || 0);
      const receivedPayments = Number(totals.received_payments || 0);
      const pendingAmount = Number(totals.pending_amount || 0);
      const pendingPaymentsCount = Number(totals.pending_payments_count || 0);
      const clearedPaymentsCount = Number(totals.cleared_payments_count || 0);

      // 2) Breakdown by order_type
      const [typeRows] = await db.execute(
        `
        SELECT o.order_type, COUNT(*) AS count
        FROM orders o
        ${whereClause}
        GROUP BY o.order_type
        `,
        params
      );

      // ✅ Targets (edit as you want)
      const TARGET_TOTAL = 2000;
      const targetByType = {
        "Hissa - Premium": 1510,
        "Hissa - Standard": 1136,
        "Hissa - Waqf": 338,
        "Goat (Hissa)": 416,
      };

      const mapLabel = (t) => {
        if (t === "Hissa - Premium") return "Hissa - Premium";
        if (t === "Hissa - Standard") return "Hissa - Standard";
        if (t === "Hissa - Waqf") return "Hissa - Waqf";
        if (t === "Goat (Hissa)") return "Goat (Hissa)";
        return t || "Other";
      };

      const breakdown = typeRows
        .map((r) => {
          const label = mapLabel(r.order_type);
          const value = Number(r.count || 0);
          const target = Number(targetByType[r.order_type] || 0);
          const pct = target > 0 ? (value / target) * 100 : 0;
          return { key: r.order_type, label, value, target, percentage: pct };
        })
        // keep only known 4 rows in same order like your design
        .sort((a, b) => {
          const order = ["Hissa - Premium", "Hissa - Standard", "Hissa - Waqf", "Goat (Hissa)"];
          return order.indexOf(a.key) - order.indexOf(b.key);
        });

      // 3) Payment clearance rate (optional)
      const clearanceRate =
        totalOrders > 0 ? (clearedPaymentsCount / totalOrders) * 100 : 0;

      res.json({
        kpis: {
          totalOrders,
          totalSales,
          receivedPayments,
          pendingAmount,
          pendingPaymentsCount,
          clearedPaymentsCount,
          clearanceRate,
        },
        target: {
          targetTotal: TARGET_TOTAL,
          achievedTotal: totalOrders,
          remaining: Math.max(0, TARGET_TOTAL - totalOrders),
        },
        breakdown,
      });
    } catch (error) {
      logError("DASHBOARD", "Dashboard summary error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};