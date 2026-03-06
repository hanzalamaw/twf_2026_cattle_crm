// Performance Management API: performers (performance_targets), daily reports (pms_daily_report), stats.
import { logError } from "../utils/logger.js";

export const registerPerformanceRoutes = (app, db, verifyToken) => {
  // ---------- Performers (performance_targets) ----------
  app.get("/api/performance/performers", verifyToken, async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT pt.performer_id, pt.display_name, pt.user_id, pt.calls_target, pt.leads_target, pt.orders_target,
                u.username, u.first_name, u.last_name
         FROM performance_targets pt
         LEFT JOIN users u ON pt.user_id = u.user_id
         ORDER BY pt.display_name`
      );
      res.json(rows);
    } catch (error) {
      logError("PERFORMANCE", "List performers error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  const validateTargets = (calls, leads, orders) => {
    const c = Number(calls) || 0;
    const l = Number(leads) || 0;
    const o = Number(orders) || 0;
    if (c <= l) return "Calls target must be greater than leads target.";
    if (c <= o) return "Calls target must be greater than orders target.";
    if (l <= o) return "Leads target must be greater than orders target.";
    return null;
  };

  app.post("/api/performance/performers", verifyToken, async (req, res) => {
    try {
      const { display_name, user_id, calls_target = 0, leads_target = 0, orders_target = 0 } = req.body;
      if (!display_name || !user_id) {
        return res.status(400).json({ message: "display_name and user_id are required" });
      }
      const c = Number(calls_target) || 0, l = Number(leads_target) || 0, o = Number(orders_target) || 0;
      const targetErr = validateTargets(c, l, o);
      if (targetErr) return res.status(400).json({ message: targetErr });
      const [result] = await db.execute(
        `INSERT INTO performance_targets (display_name, user_id, calls_target, leads_target, orders_target)
         VALUES (?, ?, ?, ?, ?)`,
        [display_name.trim(), user_id, Number(calls_target) || 0, Number(leads_target) || 0, Number(orders_target) || 0]
      );
      res.status(201).json({ message: "Performer added", performer_id: result.insertId });
    } catch (error) {
      logError("PERFORMANCE", "Create performer error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/performance/performers/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { display_name, user_id, calls_target, leads_target, orders_target } = req.body;
      const updates = [];
      const values = [];
      if (display_name !== undefined) {
        updates.push("display_name = ?");
        values.push(display_name.trim());
      }
      if (user_id !== undefined) {
        updates.push("user_id = ?");
        values.push(user_id);
      }
      if (calls_target !== undefined) {
        updates.push("calls_target = ?");
        values.push(Number(calls_target) || 0);
      }
      if (leads_target !== undefined) {
        updates.push("leads_target = ?");
        values.push(Number(leads_target) || 0);
      }
      if (orders_target !== undefined) {
        updates.push("orders_target = ?");
        values.push(Number(orders_target) || 0);
      }
      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }
      const isUpdatingTargets = [calls_target, leads_target, orders_target].some((v) => v !== undefined);
      if (isUpdatingTargets) {
        const [rows] = await db.execute(
          "SELECT calls_target, leads_target, orders_target FROM performance_targets WHERE performer_id = ?",
          [id]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Performer not found" });
        const current = rows[0];
        const c = calls_target !== undefined ? Number(calls_target) || 0 : Number(current.calls_target) || 0;
        const l = leads_target !== undefined ? Number(leads_target) || 0 : Number(current.leads_target) || 0;
        const o = orders_target !== undefined ? Number(orders_target) || 0 : Number(current.orders_target) || 0;
        const targetErr = validateTargets(c, l, o);
        if (targetErr) return res.status(400).json({ message: targetErr });
      }
      values.push(id);
      await db.execute(
        `UPDATE performance_targets SET ${updates.join(", ")} WHERE performer_id = ?`,
        values
      );
      res.json({ message: "Performer updated" });
    } catch (error) {
      logError("PERFORMANCE", "Update performer error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/performance/performers/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      await db.execute("DELETE FROM pms_daily_report WHERE performer_id = ?", [id]);
      await db.execute("DELETE FROM performance_targets WHERE performer_id = ?", [id]);
      res.json({ message: "Performer deleted" });
    } catch (error) {
      logError("PERFORMANCE", "Delete performer error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Daily reports (pms_daily_report) ----------
  app.get("/api/performance/daily-reports", verifyToken, async (req, res) => {
    try {
      const { performer_id, from_date, to_date } = req.query;
      let sql = `
        SELECT r.report_id, r.performer_id, r.date, r.calls_done, r.leads_generated, r.orders_confirmed,
               pt.display_name
        FROM pms_daily_report r
        JOIN performance_targets pt ON r.performer_id = pt.performer_id
        WHERE 1=1`;
      const params = [];
      if (performer_id) {
        sql += " AND r.performer_id = ?";
        params.push(performer_id);
      }
      if (from_date) {
        sql += " AND r.date >= ?";
        params.push(from_date);
      }
      if (to_date) {
        sql += " AND r.date <= ?";
        params.push(to_date);
      }
      sql += " ORDER BY r.date DESC, pt.display_name";
      const [rows] = await db.execute(sql, params);
      res.json(rows);
    } catch (error) {
      logError("PERFORMANCE", "List daily reports error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/performance/daily-reports", verifyToken, async (req, res) => {
    try {
      const { performer_id, date, calls_done = 0, leads_generated = 0, orders_confirmed = 0 } = req.body;
      if (!performer_id || !date) {
        return res.status(400).json({ message: "performer_id and date are required" });
      }
      const [existing] = await db.execute(
        "SELECT report_id FROM pms_daily_report WHERE performer_id = ? AND date = ?",
        [performer_id, date]
      );
      if (existing.length > 0) {
        return res.status(400).json({ message: "A report for this performer and date already exists. Use edit to update." });
      }
      const [result] = await db.execute(
        `INSERT INTO pms_daily_report (performer_id, date, calls_done, leads_generated, orders_confirmed)
         VALUES (?, ?, ?, ?, ?)`,
        [performer_id, date, Number(calls_done) || 0, Number(leads_generated) || 0, Number(orders_confirmed) || 0]
      );
      res.status(201).json({ message: "Daily report added", report_id: result.insertId });
    } catch (error) {
      logError("PERFORMANCE", "Create daily report error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.put("/api/performance/daily-reports/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;
      const { date, calls_done, leads_generated, orders_confirmed } = req.body;
      const updates = [];
      const values = [];
      if (date !== undefined) {
        updates.push("date = ?");
        values.push(date);
      }
      if (calls_done !== undefined) {
        updates.push("calls_done = ?");
        values.push(Number(calls_done) || 0);
      }
      if (leads_generated !== undefined) {
        updates.push("leads_generated = ?");
        values.push(Number(leads_generated) || 0);
      }
      if (orders_confirmed !== undefined) {
        updates.push("orders_confirmed = ?");
        values.push(Number(orders_confirmed) || 0);
      }
      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }
      values.push(id);
      await db.execute(
        `UPDATE pms_daily_report SET ${updates.join(", ")} WHERE report_id = ?`,
        values
      );
      res.json({ message: "Daily report updated" });
    } catch (error) {
      logError("PERFORMANCE", "Update daily report error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/performance/daily-reports/:id", verifyToken, async (req, res) => {
    try {
      await db.execute("DELETE FROM pms_daily_report WHERE report_id = ?", [req.params.id]);
      res.json({ message: "Daily report deleted" });
    } catch (error) {
      logError("PERFORMANCE", "Delete daily report error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Stats for dashboard ----------
  app.get("/api/performance/stats", verifyToken, async (req, res) => {
    try {
      const { from_date, to_date } = req.query;
      const params = [];
      let joinCondition = "pt.performer_id = r.performer_id";
      if (from_date) {
        joinCondition += " AND r.date >= ?";
        params.push(from_date);
      }
      if (to_date) {
        joinCondition += " AND r.date <= ?";
        params.push(to_date);
      }

      const [performerStatsFiltered] = await db.execute(
        `SELECT pt.performer_id, pt.display_name,
                pt.calls_target, pt.leads_target, pt.orders_target,
                COALESCE(SUM(r.calls_done), 0) AS calls_done,
                COALESCE(SUM(r.leads_generated), 0) AS leads_generated,
                COALESCE(SUM(r.orders_confirmed), 0) AS orders_confirmed
         FROM performance_targets pt
         LEFT JOIN pms_daily_report r ON ${joinCondition}
         GROUP BY pt.performer_id, pt.display_name, pt.calls_target, pt.leads_target, pt.orders_target
         ORDER BY pt.display_name`,
        params
      );

      const totals = performerStatsFiltered.reduce(
        (acc, p) => ({
          calls_done: acc.calls_done + Number(p.calls_done || 0),
          leads_generated: acc.leads_generated + Number(p.leads_generated || 0),
          orders_confirmed: acc.orders_confirmed + Number(p.orders_confirmed || 0),
          calls_target: acc.calls_target + Number(p.calls_target || 0),
          leads_target: acc.leads_target + Number(p.leads_target || 0),
          orders_target: acc.orders_target + Number(p.orders_target || 0),
        }),
        { calls_done: 0, leads_generated: 0, orders_confirmed: 0, calls_target: 0, leads_target: 0, orders_target: 0 }
      );

      res.json({
        performers: performerStatsFiltered,
        totals,
      });
    } catch (error) {
      logError("PERFORMANCE", "Stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
