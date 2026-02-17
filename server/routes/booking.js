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
      const { search, slot, order_type, day, reference, cow_number, year, page, limit } = req.query;
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
      const fromClause = `
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(bank) AS bank, SUM(cash) AS cash
          FROM payments
          GROUP BY order_id
        ) p ON o.order_id = p.order_id
        ${whereClause}
      `;

      const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const offset = (pageNum - 1) * limitNum;

      const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
        params
      );
      const total = countRows[0]?.total ?? 0;

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
        ${fromClause}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await db.execute(query, [...params, limitNum, offset]);
      log("BOOKING", "Orders list fetched", { user_id: req.userId, count: rows.length, total, page: pageNum });
      res.json({ data: rows, total });
    } catch (error) {
      logError("BOOKING", "Orders list error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "ORDER_LIST_ERROR", entity_type: "orders", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
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
      await writeAuditLog(db, { user_id: req.userId, action: "ORDER_FILTERS_ERROR", entity_type: "orders", new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });

  // Log order export (client calls after generating Excel)
  app.post("/api/booking/orders/export-audit", verifyToken, async (req, res) => {
    try {
      const { count, filters, order_ids } = req.body || {};
      const exportCount = typeof count === "number" && count >= 0 ? count : 0;
      const newValues = { count: exportCount };
      if (filters && typeof filters === "object" && Object.keys(filters).length > 0) {
        newValues.filters = filters;
      }
      if (order_ids && Array.isArray(order_ids) && order_ids.length > 0) {
        newValues.order_ids = order_ids;
      }
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "ORDER_EXPORT",
        entity_type: "orders",
        new_values: newValues,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });
      log("BOOKING", "Orders export", { user_id: req.userId, count: exportCount });
      res.json({ ok: true });
    } catch (error) {
      logError("BOOKING", "Export audit error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Update order
  app.put("/api/booking/orders/:orderId", verifyToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const body = req.body;
      const [oldRows] = await db.execute(
        `SELECT customer_id, cow_number AS cow, hissa_number AS hissa, slot, booking_name, shareholder_name, contact AS phone_number, alt_contact AS alt_phone, address, area, day, order_type AS type, booking_date, total_amount, received_amount AS received, pending_amount AS pending, order_source AS source, reference, description FROM orders WHERE order_id = ?`,
        [orderId]
      );
      const rawOld = oldRows.length > 0 ? oldRows[0] : null;
      const rawNew = { ...body };

      const toDateOnly = (v) => {
        if (v == null || v === "") return v;
        const s = String(v);
        const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : s;
      };
      const omitOrderId = (obj) => {
        if (!obj || typeof obj !== "object") return obj;
        const out = { ...obj };
        delete out.order_id;
        return out;
      };
      const oldValues = rawOld ? omitOrderId({ ...rawOld, booking_date: toDateOnly(rawOld.booking_date) }) : null;
      const newValues = omitOrderId({ ...rawNew, booking_date: body.booking_date !== undefined ? toDateOnly(body.booking_date) : undefined });

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
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_ORDER", entity_type: "orders", entity_id: orderId, old_values: oldValues, new_values: newValues, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order updated", { user_id: req.userId, orderId });
      res.json({ message: "Order updated", order_id: orderId });
    } catch (error) {
      logError("BOOKING", "Update order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "UPDATE_ORDER_ERROR", entity_type: "orders", entity_id: req.params.orderId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
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
      const orderDetail = { order_id: orderId, cancelled_id: cancelId, ...o };
      await writeAuditLog(db, { user_id: req.userId, action: "CANCEL_ORDER", entity_type: "orders", entity_id: orderId, new_values: orderDetail, ip_address: req.ip, user_agent: req.get("user-agent") });
      log("BOOKING", "Order cancelled", { user_id: req.userId, orderId, cancelId });
      res.json({ message: "Order cancelled", cancelled_id: cancelId });
    } catch (error) {
      logError("BOOKING", "Cancel order error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "CANCEL_ORDER_ERROR", entity_type: "orders", entity_id: req.params.orderId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
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
      if (orders.length === 0) {
        await writeAuditLog(db, { user_id: req.userId, action: "INVOICE_NO_ORDERS", entity_type: "invoice", entity_id: customerId, new_values: { reason: "no_orders_2026" }, ip_address: req.ip, user_agent: req.get("user-agent") });
        return res.status(404).json({ message: "No orders found for this customer in 2026" });
      }
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
      const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
      doc.pipe(res);

      const pageW = doc.page.width - 100;
      const pageHeight = doc.page.height;
      const left = 50;
      const right = doc.page.width - 50;

      const footerZoneTop = pageHeight - 48;
      const contentBottom = footerZoneTop - 4;

      const wrapLines = (text, width, fontSize) => {
        doc.font("Helvetica").fontSize(fontSize);
        const words = String(text).split(/\s+/);
        const lines = [];
        let line = "";
        for (const w of words) {
          const tryLine = line ? `${line} ${w}` : w;
          if (doc.widthOfString(tryLine) <= width) line = tryLine;
          else {
            if (line) lines.push(line);
            line = w;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      const textClip = (str, x, y, opts) => {
        const h = opts.height || 200;
        doc.text(str, x, y, { ...opts, height: h });
      };

      const gray = "#888888";

      // --- Header ---
      doc.fontSize(18).font("Helvetica-Bold").text("THE WARSI FARM", left, 50);
      doc.fontSize(14).font("Helvetica-Bold").text("INVOICE", right - 150, 50, { width: 150, align: "right" });
      doc.fontSize(10).font("Helvetica").text(invoiceNumber, right - 150, 66, { width: 150, align: "right" });
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, 82).lineTo(right, 82).stroke().strokeColor("#000000").lineWidth(1);

      const col1Right = left + 160;
      const col2Left = left + 180;
      const col2Right = right - 190;
      const col3Left = right - 180;
      const blockTop = 88;
      const blockBottom = 162;
      const sectionPad = 14;

      const billedLeft = col2Left + sectionPad;
      const billedWidth = col2Right - billedLeft;
      const fromLeft = col3Left + sectionPad;
      const fromWidth = right - fromLeft;

      doc.fontSize(10).font("Helvetica-Bold").text("Booking Date", left, blockTop);
      doc.font("Helvetica").text(bookingDateStr || "—", left, blockTop + 13);
      doc.font("Helvetica-Bold").text("Issued Date", left, blockTop + 30);
      doc.font("Helvetica").text(issuedDate, left, blockTop + 43);

      // Billed to: Bold heading only; then Full Name (not bold), Phone (not bold), Address (not bold)
      doc.fontSize(10).font("Helvetica-Bold").text("Billed to", billedLeft, blockTop);
      doc.font("Helvetica");
      const fullName = (customer.shareholder_name || customer.booking_name || "—").trim();
      doc.text(fullName, billedLeft, blockTop + 14, { width: billedWidth, height: 16 });
      doc.text(customer.contact || "—", billedLeft, blockTop + 30, { width: billedWidth, height: 14 });
      const billedAddr = [customer.address, customer.area].filter(Boolean).join(", ") || "";
      if (billedAddr) doc.text(billedAddr, billedLeft, blockTop + 46, { width: billedWidth, height: 20 });

      // From section: left-aligned with padding left
      doc.font("Helvetica-Bold").text("From", fromLeft, blockTop);
      doc.font("Helvetica").text("The Warsi Farm", fromLeft, blockTop + 14);
      doc.text("B-655, F.B.A Block # 13,", fromLeft, blockTop + 28);
      doc.text("Gulberg, Karachi", fromLeft, blockTop + 42);

      doc.strokeColor(gray).lineWidth(0.5);
      doc.moveTo(col2Left, blockTop).lineTo(col2Left, blockBottom).stroke();
      doc.moveTo(col3Left, blockTop).lineTo(col3Left, blockBottom).stroke();
      doc.strokeColor("#000000").lineWidth(1);

      let y = 165;
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke().strokeColor("#000000").lineWidth(1);
      y += 12;

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Service", left, y);
      doc.text("Qty", right - 180, y, { width: 50, align: "center" });
      doc.text("Total Amount", right - 120, y, { width: 120, align: "right" });
      y += 14;

      doc.font("Helvetica").fontSize(10);
      for (const row of orders) {
        const serviceTitle = row.type || "Booking";
        const serviceSub = `Cow No: ${row.cow || "—"} | Hissa No: ${row.hissa || "—"} • ${row.day || "—"}`;
        textClip(serviceTitle, left, y, { width: pageW - 200, height: 14 });
        y += 12;
        textClip(serviceSub, left, y, { width: pageW - 200, height: 14 });
        doc.text("1", right - 180, y - 12, { width: 50, align: "center" });
        doc.text(`PKR ${fmt(row.total_amount)}`, right - 120, y - 12, { width: 120, align: "right" });
        y += 16;
      }

      y += 4;
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, y).lineTo(right, y).stroke().strokeColor("#000000").lineWidth(1);
      y += 10;

      // --- Calculation summary: HALF WIDTH, RIGHT SIDE ONLY (not full page) ---
      const summaryWidth = Math.floor(pageW / 2);
      const summaryLeft = right - summaryWidth;
      const sumLineLeft = summaryLeft;
      const sumLineRight = right;
      const labelW = 100;
      const valW = 100;
      const valX = right - valW;

      doc.font("Helvetica-Bold").text("Subtotal:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandTotal)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#999999").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 6;
      doc.font("Helvetica").text("Shipping:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text("Free", valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#999999").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 6;
      doc.font("Helvetica-Bold").text("Total:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandTotal)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#999999").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 8;

      doc.fillColor("#166534").font("Helvetica-Bold").text("Amount Paid:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandReceived)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#166534").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      y += 10;
      doc.fillColor("#b91c1c").font("Helvetica-Bold").text("Amount Due:", sumLineLeft, y, { width: labelW, align: "right" });
      doc.text(`PKR ${fmt(grandPending)}`, valX, y, { width: valW, align: "right" });
      y += 11;
      doc.strokeColor("#b91c1c").lineWidth(0.5).moveTo(sumLineLeft, y).lineTo(sumLineRight, y).stroke().lineWidth(1).strokeColor("#000000");
      doc.fillColor("#000000");
      y += 18;

      doc.font("Helvetica-Bold").fontSize(10).text("PAYMENT INFO", left, y);
      y += 10;
      doc.font("Helvetica").fontSize(9);
      doc.text("ACCOUNT NAME (HBL)", left, y);
      doc.text("BRANCH", left + 140, y);
      doc.text("IBAN", left + 280, y);
      doc.text("ACCOUNT NO", left + 400, y);
      y += 11;
      doc.text("TW TRADERS", left, y);
      doc.text("ZIAUDDIN SHAHEED ROA", left + 140, y);
      doc.text("PK10HABB0016787900655603", left + 280, y, { width: 110 });
      doc.text("16787900655603", left + 400, y);
      y += 18;

      doc.font("Helvetica-Bold").fontSize(10).text("TERMS & CONDITIONS", left, y);
      y += 12;
      doc.font("Helvetica").fontSize(8);
      const terms = [
        "Livestock bookings must be paid in full at the time of purchase. For Qurbani orders, full payment is required at least 7 days before Eid.",
        "Accepted payment methods: Cash, Bank Transfer, Easypaisa, JazzCash, or Online Checkout.",
        "Free delivery within Karachi. Delivery timelines are communicated at the time of booking. Delays due to unforeseen events will be informed in advance.",
        "Ensure accurate delivery information and availability at the time of delivery. Any delays caused due to incorrect information or unavailability at delivery address will not be compensated.",
        "THE WARSI FARM is not liable for delays or issues caused by unforeseen circumstances like natural disasters, transport strikes, or technical faults.",
      ];
      const lineHeight = 11;
      const termGap = 4;
      for (let i = 0; i < terms.length; i++) {
        const lines = wrapLines(`${i + 1}. ${terms[i]}`, pageW, 8);
        for (const line of lines) {
          if (y + lineHeight > contentBottom) break;
          doc.text(line, left, y, { width: pageW, height: lineHeight + 2 });
          y += lineHeight;
        }
        y += termGap;
      }

      // Footer: The Warsi Farm left (unchanged); phone | website on same line, right-aligned
      const footerY = footerZoneTop + 2;
      doc.strokeColor(gray).lineWidth(0.5).moveTo(left, footerZoneTop - 4).lineTo(right, footerZoneTop - 4).stroke().strokeColor("#000000").lineWidth(1);
      doc.font("Helvetica").fontSize(9);
      doc.text("The Warsi Farm", left, footerY, { lineBreak: false });
      const footerRightStr = "(0331 & 0332) - 9911466  |  thewarsifarm.com";
      doc.text(footerRightStr, right - doc.widthOfString(footerRightStr), footerY, { lineBreak: false });

      doc.end();
    } catch (error) {
      logError("BOOKING", "Invoice error", error);
      await writeAuditLog(db, { user_id: req.userId, action: "INVOICE_ERROR", entity_type: "invoice", entity_id: req.params.customerId, new_values: { reason: "server_error" }, ip_address: req.ip, user_agent: req.get("user-agent") });
      res.status(500).json({ message: "Server error" });
    }
  });
};
