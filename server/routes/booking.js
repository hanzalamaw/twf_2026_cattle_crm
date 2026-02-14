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
      const { search, slot, order_type, day, reference, cow_number, year } = req.query;
      const conditions = [];
      const params = [];

      if (year === "2026" || year === "2025" || year === "2024") {
        conditions.push("YEAR(o.booking_date) = ?");
        params.push(year);
      } else if (year === "other") {
        conditions.push("(o.booking_date IS NULL OR YEAR(o.booking_date) NOT IN (2025, 2026))");
      }
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
        new_values: { count: rows.length, filters: { search: !!search, slot: !!slot, order_type: !!order_type, day: !!day, reference: !!reference, cow_number: !!cow_number, year } },
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

  // Invoice PDF: THE WARSI FARM style - all orders for customer_id in year 2026
  app.get("/api/booking/invoice/:customerId", verifyToken, async (req, res) => {
    try {
      const { customerId } = req.params;
      const [orders] = await db.execute(
        `SELECT o.order_id, o.cow_number AS cow, o.hissa_number AS hissa, o.booking_name, o.shareholder_name, o.contact, o.alt_contact, o.address, o.area, o.day, o.order_type AS type, o.booking_date, o.total_amount, o.received_amount, o.pending_amount
         FROM orders o WHERE o.customer_id = ? AND YEAR(o.booking_date) = 2026 ORDER BY o.booking_date, o.order_id`,
        [customerId]
      );
      if (orders.length === 0) return res.status(404).json({ message: "No orders found for this customer in 2026" });
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
      const bookingDateStr = customer.booking_date ? (typeof customer.booking_date === "string" ? customer.booking_date.split("T")[0] : customer.booking_date.toISOString().split("T")[0]) : "";
      const issuedDate = new Date().toISOString().split("T")[0];
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
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);
      const pageW = doc.page.width - 100;
      const left = 50;
      const right = doc.page.width - 50;

      // Header: THE WARSI FARM (left), INVOICE + number (right)
      doc.fontSize(18).font("Helvetica-Bold").text("THE WARSI FARM", left, 50);
      doc.fontSize(14).font("Helvetica-Bold").text("INVOICE", right - 150, 50, { width: 150, align: "right" });
      doc.fontSize(10).font("Helvetica").text(invoiceNumber, right - 150, 66, { width: 150, align: "right" });
      // Horizontal line under INVOICE block extending left
      doc.moveTo(right, 82).lineTo(left, 82).stroke();

      // Three-column block with vertical separators
      const col1Right = left + 160;
      const col2Left = left + 180;
      const col2Right = right - 190;
      const col3Left = right - 180;
      const blockTop = 88;
      const blockBottom = 162;

      // Booking Date, Issued Date (column 1)
      doc.fontSize(10).font("Helvetica-Bold").text("Booking Date", left, blockTop);
      doc.font("Helvetica").text(bookingDateStr || "—", left, blockTop + 13);
      doc.font("Helvetica-Bold").text("Issued Date", left, blockTop + 30);
      doc.font("Helvetica").text(issuedDate, left, blockTop + 43);

      // Billed to (column 2)
      doc.font("Helvetica-Bold").text("Billed to", col2Left, blockTop);
      const billedName = [customer.booking_name, customer.shareholder_name].filter(Boolean).join(" / ") || "—";
      doc.font("Helvetica").text(billedName, col2Left, blockTop + 13, { width: col2Right - col2Left });
      doc.text(customer.contact || "", col2Left, blockTop + 26, { width: col2Right - col2Left });
      if (customer.alt_contact) doc.text(customer.alt_contact, col2Left, blockTop + 39, { width: col2Right - col2Left });
      const billedAddr = [customer.address, customer.area].filter(Boolean).join(", ") || "";
      if (billedAddr) doc.text(billedAddr, col2Left, customer.alt_contact ? blockTop + 52 : blockTop + 39, { width: col2Right - col2Left });

      // From (column 3)
      doc.font("Helvetica-Bold").text("From", col3Left, blockTop, { width: 180, align: "right" });
      doc.font("Helvetica").text("The Warsi Farm", col3Left, blockTop + 13, { width: 180, align: "right" });
      doc.text("B-655, F.B.A Block # 13,", col3Left, blockTop + 26, { width: 180, align: "right" });
      doc.text("Gulberg, Karachi", col3Left, blockTop + 39, { width: 180, align: "right" });

      // Vertical lines between columns
      doc.moveTo(col2Left, blockTop).lineTo(col2Left, blockBottom).stroke();
      doc.moveTo(col3Left, blockTop).lineTo(col3Left, blockBottom).stroke();

      let y = 165;
      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 14;

      // Service table: Service | Qty | Total Amount
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Service", left, y);
      doc.text("Qty", right - 180, y, { width: 50, align: "center" });
      doc.text("Total Amount", right - 120, y, { width: 120, align: "right" });
      y += 20;

      doc.font("Helvetica").fontSize(10);
      for (const row of orders) {
        const serviceTitle = row.type || "Booking";
        const serviceSub = `Cow No: ${row.cow || "—"} | Hissa No: ${row.hissa || "—"} • ${row.day || "—"}`;
        doc.font("Helvetica-Bold").text(serviceTitle, left, y, { width: pageW - 180 });
        y += 14;
        doc.font("Helvetica").text(serviceSub, left, y, { width: pageW - 180 });
        doc.text("1", right - 180, y - 14, { width: 50, align: "center" });
        doc.text(`PKR ${fmt(row.total_amount)}`, right - 120, y - 14, { width: 120, align: "right" });
        y += 22;
      }

      y += 6;
      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 16;

      // Subtotal, Shipping, Total
      doc.font("Helvetica-Bold").text("Subtotal:", left, y);
      doc.text(`PKR ${fmt(grandTotal)}`, right - 120, y, { width: 120, align: "right" });
      y += 16;
      doc.text("Shipping:", left, y);
      doc.text("Free", right - 120, y, { width: 120, align: "right" });
      y += 16;
      doc.text("Total:", left, y);
      doc.text(`PKR ${fmt(grandTotal)}`, right - 120, y, { width: 120, align: "right" });
      y += 20;
      doc.moveTo(left, y).lineTo(right, y).stroke();
      y += 16;

      // Amount Paid (green) with full-width green underline
      doc.fillColor("#166534").font("Helvetica-Bold").text("Amount Paid:", left, y);
      doc.text(`PKR ${fmt(grandReceived)}`, right - 120, y, { width: 120, align: "right" });
      y += 14;
      doc.moveTo(left, y).lineTo(right, y).stroke("#166534");
      y += 18;
      // Amount Due (red) with full-width red underline
      doc.fillColor("#b91c1c").text("Amount Due:", left, y);
      doc.text(`PKR ${fmt(grandPending)}`, right - 120, y, { width: 120, align: "right" });
      y += 14;
      doc.moveTo(left, y).lineTo(right, y).stroke("#b91c1c");
      doc.fillColor("#000000");
      y += 28;

      // PAYMENT INFO
      doc.font("Helvetica-Bold").fontSize(10).text("PAYMENT INFO", left, y);
      y += 16;
      doc.font("Helvetica").fontSize(9);
      doc.text("ACCOUNT NAME (HBL)", left, y);
      doc.text("BRANCH", left + 140, y);
      doc.text("IBAN", left + 280, y);
      doc.text("ACCOUNT NO", left + 400, y);
      y += 14;
      doc.text("TW TRADERS", left, y);
      doc.text("ZIAUDDIN SHAHEED ROA", left + 140, y);
      doc.text("PK10HABB0016787900655603", left + 280, y, { width: 110 });
      doc.text("16787900655603", left + 400, y);
      y += 32;

      // TERMS & CONDITIONS
      doc.font("Helvetica-Bold").fontSize(10).text("TERMS & CONDITIONS", left, y);
      y += 14;
      doc.font("Helvetica").fontSize(8);
      const terms = [
        "Livestock bookings must be paid in full at the time of purchase. For Qurbani orders, full payment is required at least 7 days before Eid.",
        "Accepted payment methods: Cash, Bank Transfer, Easypaisa, JazzCash, or Online Checkout.",
        "Free delivery within Karachi. Delivery timelines are communicated at the time of booking. Delays due to unforeseen events will be informed in advance.",
        "Ensure accurate delivery information and availability at the time of delivery. Any delays caused due to incorrect information or unavailability at delivery address will not be compensated.",
        "THE WARSI FARM is not liable for delays or issues caused by unforeseen circumstances like natural disasters, transport strikes, or technical faults.",
      ];
      for (let i = 0; i < terms.length; i++) {
        doc.text(`${i + 1}. ${terms[i]}`, left, y, { width: pageW, align: "left" });
        y += doc.heightOfString(terms[i], { width: pageW }) + 4;
      }
      y += 20;

      // Footer (below terms or bottom of page)
      const footerY = Math.max(y, doc.page.height - 40);
      doc.font("Helvetica").fontSize(9).text("The Warsi Farm", left, footerY);
      doc.text("(0331 & 0332) - 9911466 | thewarsifarm.com", right - 280, footerY, { width: 280, align: "right" });

      doc.end();
    } catch (error) {
      logError("BOOKING", "Invoice error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};
