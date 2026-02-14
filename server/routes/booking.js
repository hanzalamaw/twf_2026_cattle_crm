import PDFDocument from "pdfkit";
import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

/**
 * Booking management API: orders list with search and filters.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 * @param {Function} verifyToken - auth middleware
 */
export const registerBookingRoutes = (app, db, verifyToken) => {
  app.get("/api/booking/orders", verifyToken, async (req, res) => {
    try {
      const { search, slot, order_type, day, reference, cow_number } = req.query;
      const conditions = [];
      const params = [];

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
      if (order_type) {
        conditions.push("o.order_type = ?");
        params.push(order_type);
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
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(bank) AS bank, SUM(cash) AS cash
          FROM payments
          GROUP BY order_id
        ) p ON o.order_id = p.order_id
        ${whereClause}
        ORDER BY o.created_at DESC
      `;

      const [rows] = await db.execute(query, params);

      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ORDER_LIST",
        entity_type: "orders",
        new_values: { count: rows.length, filters: { search: !!search, slot: !!slot, order_type: !!order_type, day: !!day, reference: !!reference, cow_number: !!cow_number } },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Orders list fetched", { user_id: req.userId, count: rows.length });

      res.json(rows);
    } catch (error) {
      logError("BOOKING", "Orders list error", error);
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
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update order
  app.put("/api/booking/orders/:orderId", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const body = req.body;
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
          params.push(body[clientKey]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });
      params.push(orderId);
      await db.execute(
        `UPDATE orders SET ${updates.join(", ")} WHERE order_id = ?`,
        params
      );
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_ORDER", entity_type: "orders", entity_id: orderId, new_values: body, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order updated", { user_id: req.userId, orderId });
      res.json({ message: "Order updated", order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Update order error", error);
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
      await writeAuditLog(db, { user_id: req.userId, action: "CANCEL_ORDER", entity_type: "orders", entity_id: orderId, new_values: { cancelled_id: cancelId }, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order cancelled", { user_id: req.userId, orderId, cancelId });
      res.json({ message: "Order cancelled", cancelled_id: cancelId });
    } catch (error) {
      logError("BOOKING", "Cancel order error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Invoice PDF: all orders for customer_id in year 2026
  app.get("/api/booking/invoice/:customerId", verifyToken, async (req, res) => {
    try {
      const { customerId } = req.params;
      const [orders] = await db.execute(
        `SELECT o.order_id, o.cow_number AS cow, o.hissa_number AS hissa, o.booking_name, o.shareholder_name, o.contact, o.alt_contact, o.address, o.area, o.day, o.order_type AS type, o.booking_date, o.total_amount, o.received_amount, o.pending_amount, o.order_source AS source, o.reference, o.description
         FROM orders o WHERE o.customer_id = ? AND YEAR(o.booking_date) = 2026 ORDER BY o.booking_date, o.order_id`,
        [customerId]
      );
      if (orders.length === 0) return res.status(404).json({ message: "No orders found for this customer in 2026" });
      const customer = orders[0];
      const invoiceNumber = `I-${String(orders.length).padStart(4, "0")}-2026`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Invoice-${invoiceNumber}-${customerId}.pdf"`);
      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(res);
      doc.fontSize(20).text("TWF Cattle CRM - Invoice", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Invoice No: ${invoiceNumber}`, { align: "center" });
      doc.text(`Customer ID: ${customerId}`, { align: "center" });
      doc.moveDown(1);
      doc.fontSize(11).text(`Booking Name: ${customer.booking_name || ""}  |  Shareholder: ${customer.shareholder_name || ""}`, { continued: false });
      doc.text(`Contact: ${customer.contact || ""}  ${customer.alt_contact ? `| Alt: ${customer.alt_contact}` : ""}`, { continued: false });
      doc.text(`Address: ${[customer.address, customer.area].filter(Boolean).join(", ") || "—"}`, { continued: false });
      doc.moveDown(1);
      const tableTop = doc.y;
      doc.fontSize(9).text("Order ID", 50, tableTop, { width: 70 });
      doc.text("Cow/Hissa", 125, tableTop, { width: 60 });
      doc.text("Type", 190, tableTop, { width: 70 });
      doc.text("Date", 265, tableTop, { width: 65 });
      doc.text("Total", 335, tableTop, { width: 70 });
      doc.text("Received", 410, tableTop, { width: 70 });
      doc.text("Pending", 485, tableTop, { width: 70 });
      doc.moveDown(0.5);
      let y = doc.y;
      let grandTotal = 0;
      let grandReceived = 0;
      let grandPending = 0;
      for (const row of orders) {
        const dateStr = row.booking_date ? (typeof row.booking_date === "string" ? row.booking_date.split("T")[0] : row.booking_date.toISOString().split("T")[0]) : "";
        doc.text(row.order_id || "", 50, y, { width: 70 });
        doc.text(`${row.cow || ""}/${row.hissa || ""}`, 125, y, { width: 60 });
        doc.text(row.type || "", 190, y, { width: 70 });
        doc.text(dateStr, 265, y, { width: 65 });
        doc.text(Number(row.total_amount || 0).toLocaleString("en-PK"), 335, y, { width: 70 });
        doc.text(Number(row.received_amount || 0).toLocaleString("en-PK"), 410, y, { width: 70 });
        doc.text(Number(row.pending_amount || 0).toLocaleString("en-PK"), 485, y, { width: 70 });
        grandTotal += Number(row.total_amount || 0);
        grandReceived += Number(row.received_amount || 0);
        grandPending += Number(row.pending_amount || 0);
        y += 22;
      }
      doc.moveDown(1);
      doc.fontSize(10).text(`Total: ${grandTotal.toLocaleString("en-PK")}  |  Received: ${grandReceived.toLocaleString("en-PK")}  |  Pending: ${grandPending.toLocaleString("en-PK")}`, { continued: false });
      doc.moveDown(2);
      doc.fontSize(9).text("Thank you for your business.", { align: "center" });
      doc.end();
    } catch (error) {
      logError("BOOKING", "Invoice error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
