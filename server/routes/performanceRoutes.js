// Performance Management API: performers (performance_targets), daily reports (pms_daily_report), stats.
import { logError } from "../utils/logger.js";

export const registerPerformanceRoutes = (app, db, verifyToken) => {
  // ---------- Audit log helper (mirrors control.js) ----------
  const logAuditAction = async (userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent) => {
    try {
      await db.execute(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          action,
          entityType,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          ipAddress,
          userAgent,
        ]
      );
    } catch (error) {
      logError("PERFORMANCE", "Audit log insert failed", error);
    }
  };

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
      const [existing] = await db.execute(
        "SELECT performer_id FROM performance_targets WHERE user_id = ?",
        [user_id]
      );
      if (existing.length > 0) {
        return res.status(400).json({ message: "This user is already linked to another performer." });
      }
      const c = Number(calls_target) || 0, l = Number(leads_target) || 0, o = Number(orders_target) || 0;
      const targetErr = validateTargets(c, l, o);
      if (targetErr) return res.status(400).json({ message: targetErr });
      const [result] = await db.execute(
        `INSERT INTO performance_targets (display_name, user_id, calls_target, leads_target, orders_target)
         VALUES (?, ?, ?, ?, ?)`,
        [display_name.trim(), user_id, c, l, o]
      );
      await logAuditAction(
        req.userId,
        "CREATE_PERFORMER",
        "performance_targets",
        result.insertId.toString(),
        null,
        { display_name, user_id, calls_target: c, leads_target: l, orders_target: o },
        req.ip,
        req.get("user-agent")
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

      // Fetch old record for audit diff
      const [oldRows] = await db.execute(
        "SELECT * FROM performance_targets WHERE performer_id = ?",
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Performer not found" });
      const oldPerformer = oldRows[0];

      const updates = [];
      const values = [];
      if (display_name !== undefined) {
        updates.push("display_name = ?");
        values.push(display_name.trim());
      }
      if (user_id !== undefined) {
        const [existing] = await db.execute(
          "SELECT performer_id FROM performance_targets WHERE user_id = ? AND performer_id <> ?",
          [user_id, id]
        );
        if (existing.length > 0) {
          return res.status(400).json({ message: "This user is already linked to another performer." });
        }
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
        const c = calls_target !== undefined ? Number(calls_target) || 0 : Number(oldPerformer.calls_target) || 0;
        const l = leads_target !== undefined ? Number(leads_target) || 0 : Number(oldPerformer.leads_target) || 0;
        const o = orders_target !== undefined ? Number(orders_target) || 0 : Number(oldPerformer.orders_target) || 0;
        const targetErr = validateTargets(c, l, o);
        if (targetErr) return res.status(400).json({ message: targetErr });
      }

      values.push(id);
      await db.execute(
        `UPDATE performance_targets SET ${updates.join(", ")} WHERE performer_id = ?`,
        values
      );

      const [newRows] = await db.execute(
        "SELECT * FROM performance_targets WHERE performer_id = ?",
        [id]
      );
      await logAuditAction(
        req.userId,
        "UPDATE_PERFORMER",
        "performance_targets",
        id,
        oldPerformer,
        newRows[0],
        req.ip,
        req.get("user-agent")
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

      const [oldRows] = await db.execute(
        "SELECT * FROM performance_targets WHERE performer_id = ?",
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Performer not found" });

      await db.execute("DELETE FROM pms_daily_report WHERE performer_id = ?", [id]);
      await db.execute("DELETE FROM performance_targets WHERE performer_id = ?", [id]);

      await logAuditAction(
        req.userId,
        "DELETE_PERFORMER",
        "performance_targets",
        id,
        oldRows[0],
        null,
        req.ip,
        req.get("user-agent")
      );
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
        SELECT r.report_id, r.performer_id,
               DATE_FORMAT(r.date, '%Y-%m-%d') AS date,
               r.calls_done, r.leads_generated, r.orders_confirmed,
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

  // Prefill daily report from booking orders by performer/date (closed_by + booking_date).
  app.get("/api/performance/daily-reports/prefill", verifyToken, async (req, res) => {
    try {
      const { performer_id, date } = req.query;
      if (!performer_id || !date) {
        return res.status(400).json({ message: "performer_id and date are required" });
      }

      const [perfRows] = await db.execute(
        "SELECT display_name FROM performance_targets WHERE performer_id = ? LIMIT 1",
        [performer_id]
      );
      if (perfRows.length === 0) {
        return res.status(404).json({ message: "Performer not found" });
      }

      const displayName = String(perfRows[0].display_name || "").trim();
      if (!displayName) {
        return res.json({ leads_generated: 0, orders_confirmed: 0 });
      }

      const [orderRows] = await db.execute(
        `SELECT COUNT(*) AS ordersCount
         FROM orders o
         WHERE o.booking_date = ?
           AND o.closed_by IS NOT NULL
           AND TRIM(o.closed_by) <> ''
           AND LOWER(TRIM(o.closed_by)) = LOWER(TRIM(?))`,
        [date, displayName]
      );

      const [leadRows] = await db.execute(
        `SELECT COUNT(*) AS leadsCount
         FROM leads l
         WHERE l.booking_date = ?
           AND l.closed_by IS NOT NULL
           AND TRIM(l.closed_by) <> ''
           AND LOWER(TRIM(l.closed_by)) = LOWER(TRIM(?))`,
        [date, displayName]
      );

      const ordersCount = Number(orderRows?.[0]?.ordersCount || 0);
      const leadsCount = Number(leadRows?.[0]?.leadsCount || 0);

      res.json({
        leads_generated: leadsCount + ordersCount,
        orders_confirmed: ordersCount,
      });
    } catch (error) {
      logError("PERFORMANCE", "Daily prefill error", error);
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
      const c = Number(calls_done) || 0;
      const l = Number(leads_generated) || 0;
      const o = Number(orders_confirmed) || 0;
      const [result] = await db.execute(
        `INSERT INTO pms_daily_report (performer_id, date, calls_done, leads_generated, orders_confirmed)
         VALUES (?, ?, ?, ?, ?)`,
        [performer_id, date, c, l, o]
      );
      await logAuditAction(
        req.userId,
        "CREATE_DAILY_REPORT",
        "pms_daily_report",
        result.insertId.toString(),
        null,
        { report_id: result.insertId, performer_id, date: String(date).slice(0, 10), calls_done: c, leads_generated: l, orders_confirmed: o },
        req.ip,
        req.get("user-agent")
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

      // Fetch old record for audit diff — only the 4 relevant fields
      const [oldRows] = await db.execute(
        `SELECT report_id, performer_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, calls_done, leads_generated, orders_confirmed
         FROM pms_daily_report WHERE report_id = ?`,
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Daily report not found" });
      const oldReport = oldRows[0];

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

      const [newRows] = await db.execute(
        `SELECT report_id, performer_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, calls_done, leads_generated, orders_confirmed
         FROM pms_daily_report WHERE report_id = ?`,
        [id]
      );
      await logAuditAction(
        req.userId,
        "UPDATE_DAILY_REPORT",
        "pms_daily_report",
        id,
        oldReport,
        newRows[0],
        req.ip,
        req.get("user-agent")
      );
      res.json({ message: "Daily report updated" });
    } catch (error) {
      logError("PERFORMANCE", "Update daily report error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/performance/daily-reports/:id", verifyToken, async (req, res) => {
    try {
      const id = req.params.id;

      const [oldRows] = await db.execute(
        `SELECT report_id, performer_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, calls_done, leads_generated, orders_confirmed
         FROM pms_daily_report WHERE report_id = ?`,
        [id]
      );
      if (oldRows.length === 0) return res.status(404).json({ message: "Daily report not found" });

      await db.execute("DELETE FROM pms_daily_report WHERE report_id = ?", [id]);

      await logAuditAction(
        req.userId,
        "DELETE_DAILY_REPORT",
        "pms_daily_report",
        id,
        oldRows[0],
        null,
        req.ip,
        req.get("user-agent")
      );
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

      const [[{ min_report: minReport, today: todayStr }]] = await db.execute(
        `SELECT DATE_FORMAT((SELECT MIN(\`date\`) FROM pms_daily_report), '%Y-%m-%d') AS min_report,
                DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`
      );

      let rangeStart;
      let rangeEnd;
      if (from_date && to_date) {
        rangeStart = String(from_date).slice(0, 10);
        rangeEnd = String(to_date).slice(0, 10);
      } else if (from_date) {
        rangeStart = String(from_date).slice(0, 10);
        rangeEnd = to_date ? String(to_date).slice(0, 10) : todayStr;
      } else if (to_date) {
        rangeEnd = String(to_date).slice(0, 10);
        rangeStart = minReport || rangeEnd;
      } else {
        rangeStart = minReport;
        rangeEnd = todayStr;
      }

      let periodDays = 0;
      if (rangeStart && rangeEnd) {
        if (rangeEnd < rangeStart) periodDays = 0;
        else {
          const [[row]] = await db.execute(`SELECT DATEDIFF(?, ?) + 1 AS d`, [rangeEnd, rangeStart]);
          periodDays = Math.max(0, Number(row?.d) || 0);
        }
      }

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

      const performers = performerStatsFiltered.map((p) => {
        const ct = Number(p.calls_target || 0) * periodDays;
        const lt = Number(p.leads_target || 0) * periodDays;
        const ot = Number(p.orders_target || 0) * periodDays;
        return {
          ...p,
          calls_target: ct,
          leads_target: lt,
          orders_target: ot,
        };
      });

      const totals = performers.reduce(
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
        performers,
        totals,
        period: {
          from: rangeStart,
          to: rangeEnd,
          days: periodDays,
        },
      });
    } catch (error) {
      logError("PERFORMANCE", "Stats error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};