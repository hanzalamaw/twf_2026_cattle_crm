import { log, logError } from "../utils/logger.js";
import { writeAuditLog } from "../utils/auditLog.js";

/**
 * New Query API: Save leads from the newquery page into the database.
 * @param {object} app - Express app
 * @param {object} db - MySQL connection
 * @param {Function} verifyToken - auth middleware
 */
export const registerNewQueryRoutes = (app, db, verifyToken) => {

  // ---------- Generate Customer ID based on Contact ----------
  const generateCustomerId = async (contact) => {
    try {
      if (!contact || String(contact).trim().length < 3) {
        throw new Error("Contact number is required (minimum 3 characters)");
      }
      const contactStr = String(contact).trim();

      // Check existing orders for this contact
      const [orderRows] = await db.execute(
        "SELECT customer_id FROM orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (orderRows.length > 0 && orderRows[0].customer_id) {
        log("BOOKING", "Customer ID found in orders", { contact: contactStr, customer_id: orderRows[0].customer_id });
        return orderRows[0].customer_id;
      }

      // Check cancelled orders for this contact
      const [cancelledRows] = await db.execute(
        "SELECT customer_id FROM cancelled_orders WHERE contact = ? LIMIT 1",
        [contactStr]
      );

      if (cancelledRows.length > 0 && cancelledRows[0].customer_id) {
        log("BOOKING", "Customer ID found in cancelled orders", { contact: contactStr, customer_id: cancelledRows[0].customer_id });
        return cancelledRows[0].customer_id;
      }

      // Generate new customer ID: TWF-XXXX-Q format
      const [maxOrderRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM orders WHERE customer_id LIKE 'TWF-%'"
      );
      const [maxCancelledRows] = await db.execute(
        "SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(customer_id, '-', 2), '-', -1) AS UNSIGNED)), 0) AS maxNum FROM cancelled_orders WHERE customer_id LIKE 'TWF-%'"
      );

      const maxOrderNum = Number(maxOrderRows[0]?.maxNum || 0);
      const maxCancelledNum = Number(maxCancelledRows[0]?.maxNum || 0);
      const nextNum = Math.max(maxOrderNum, maxCancelledNum) + 1;
      const customerId = `TWF-${String(nextNum).padStart(4, "0")}-Q`;

      log("BOOKING", "Customer ID generated", { contact: contactStr, customer_id: customerId });
      return customerId;
    } catch (error) {
      logError("BOOKING", "Generate customer ID error", error);
      throw new Error("Unable to generate Customer ID");
    }
  };

  // ---------- Generate Lead ID based on Order Type ----------
  const generateLeadId = async (orderType) => {
    try {
      const [result] = await db.execute("SELECT MAX(lead_id) AS max_id FROM leads");
      const maxId = result[0].max_id || 0;
      return `L-${maxId + 1}`;
    } catch (err) {
      logError("LEAD", "Generate Lead ID error", err);
      throw new Error("Unable to generate Lead ID");
    }
  };

  // ---------- Save new lead ----------
  app.post("/api/leads", verifyToken, async (req, res) => {
    try {
      const {
        contact,
        order_type,
        booking_name,
        shareholder_name,
        alt_contact,
        address,
        area,
        day,
        booking_date,
        total_amount,
        order_source,
        reference,
        description,
      } = req.body;

      // Check required fields
      if (!contact || !order_type || !booking_name || !booking_date || !total_amount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Generate Customer ID if not already provided
      const customer_id = await generateCustomerId(contact);

      // Generate Lead ID based on the order type
      const lead_id = await generateLeadId(order_type);

      // Insert the new lead into the leads table
      const [result] = await db.execute(
        `INSERT INTO leads 
         (lead_id, customer_id, contact, order_type, booking_name, shareholder_name, alt_contact, address, area, day, booking_date, total_amount, order_source, reference, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lead_id,
          customer_id,
          contact,
          order_type,
          booking_name,
          shareholder_name || null,
          alt_contact || null,
          address || null,
          area || null,
          day || null,
          booking_date,
          total_amount,
          order_source || null,
          reference || null,
          description || null,
        ]
      );

      // Log the action (Audit)
      await writeAuditLog(db, {
        user_id: req.userId,
        action: "CREATE_LEAD",
        entity_type: "leads",
        entity_id: lead_id,
        new_values: req.body,
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
      });

      log("LEAD", "New lead created", { lead_id });
      res.status(201).json({ message: "Lead created successfully", lead_id });
    } catch (error) {
      logError("LEAD", "Create lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Get all leads ----------
  app.get("/api/leads", verifyToken, async (req, res) => {
    try {
      const [leads] = await db.execute(`SELECT * FROM leads ORDER BY created_at DESC`);
      res.json(leads);
    } catch (error) {
      logError("LEAD", "List leads error", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ---------- Get lead by ID ----------
  app.get("/api/leads/:id", verifyToken, async (req, res) => {
    try {
      const [lead] = await db.execute("SELECT * FROM leads WHERE lead_id = ?", [req.params.id]);
      if (lead.length === 0) return res.status(404).json({ message: "Lead not found" });
      res.json(lead[0]);
    } catch (error) {
      logError("LEAD", "Get lead error", error);
      res.status(500).json({ message: "Server error" });
    }
  });
};