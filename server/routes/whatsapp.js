import qrcode from "qrcode";
import multer from "multer";
import whatsappWeb from "whatsapp-web.js";
import { log, logError } from "../utils/logger.js";

const { Client, LocalAuth, MessageMedia } = whatsappWeb;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

let waClient = null;
let clientStatus = "disconnected";
let qrDataURL = null;
const messageLog = [];
let isBootstrapped = false;

function pushLog(entry) {
  messageLog.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (messageLog.length > 100) messageLog.pop();
}

function initClient() {
  if (waClient) {
    waClient.destroy().catch(() => {});
    waClient = null;
  }

  clientStatus = "initializing";
  qrDataURL = null;

  waClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: process.env.WHATSAPP_AUTH_PATH || "./.wwebjs_auth",
    }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  waClient.on("qr", async (qr) => {
    clientStatus = "qr_ready";
    try {
      qrDataURL = await qrcode.toDataURL(qr);
      log("WHATSAPP", "QR generated");
    } catch (error) {
      logError("WHATSAPP", "QR generation failed", error);
    }
  });

  waClient.on("authenticated", () => {
    clientStatus = "authenticated";
    qrDataURL = null;
    log("WHATSAPP", "Authenticated");
  });

  waClient.on("ready", () => {
    clientStatus = "ready";
    log("WHATSAPP", "Client ready");
  });

  waClient.on("disconnected", (reason) => {
    clientStatus = "disconnected";
    qrDataURL = null;
    log("WHATSAPP", "Disconnected", { reason: String(reason || "unknown") });
  });

  waClient.on("auth_failure", (message) => {
    clientStatus = "disconnected";
    logError("WHATSAPP", "Auth failure", new Error(String(message || "auth_failure")));
  });

  waClient.initialize().catch((error) => {
    clientStatus = "disconnected";
    logError("WHATSAPP", "Initialize failed", error);
  });
}

async function fetchInvoicePdfBase64(req, customerId) {
  const port = process.env.PORT || 5000;
  const serverUrl = (process.env.SERVER_URL || `http://localhost:${port}`).replace(/\/+$/, "");
  const invoiceUrl = `${serverUrl}/api/booking/invoice/${encodeURIComponent(customerId)}`;
  const authHeader = req.headers.authorization || "";

  const response = await fetch(invoiceUrl, {
    method: "GET",
    headers: authHeader ? { Authorization: authHeader } : {},
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Failed to generate invoice PDF");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

export const registerWhatsAppRoutes = (app, verifyToken) => {
  if (!isBootstrapped) {
    const autoStart = String(process.env.WHATSAPP_AUTO_START || "true").toLowerCase() !== "false";
    if (autoStart) initClient();
    isBootstrapped = true;
  }

  app.get("/api/whatsapp/status", verifyToken, (_req, res) => {
    res.json({
      success: true,
      status: clientStatus,
      qr: qrDataURL || null,
      ready: clientStatus === "ready",
    });
  });

  app.post("/api/whatsapp/connect", verifyToken, (_req, res) => {
    initClient();
    res.json({ success: true, message: "Reinitializing WhatsApp client" });
  });

  app.post("/api/whatsapp/disconnect", verifyToken, async (_req, res) => {
    try {
      if (waClient) {
        await waClient.logout();
        await waClient.destroy();
      }
      waClient = null;
      clientStatus = "disconnected";
      qrDataURL = null;
      res.json({ success: true, message: "Disconnected and logged out" });
    } catch (error) {
      logError("WHATSAPP", "Disconnect failed", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/whatsapp/groups", verifyToken, async (_req, res) => {
    if (clientStatus !== "ready" || !waClient) {
      return res.status(503).json({ success: false, error: `WhatsApp client not ready. Status: ${clientStatus}` });
    }
    try {
      const chats = await waClient.getChats();
      const groups = chats
        .filter((chat) => chat.isGroup)
        .map((group) => ({
          id: group.id._serialized,
          name: group.name,
          participants: group.participants?.length || 0,
        }));
      res.json({ success: true, groups });
    } catch (error) {
      logError("WHATSAPP", "Get groups failed", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/whatsapp/logs", verifyToken, (_req, res) => {
    res.json({ success: true, logs: messageLog });
  });

  app.post("/api/whatsapp/send-message", verifyToken, async (req, res) => {
    if (clientStatus !== "ready" || !waClient) {
      return res.status(503).json({ success: false, error: `WhatsApp client not ready. Status: ${clientStatus}` });
    }
    const { chatId, message } = req.body || {};
    if (!chatId || !message) {
      return res.status(400).json({ success: false, error: "chatId and message are required" });
    }
    try {
      const result = await waClient.sendMessage(chatId, message);
      pushLog({ type: "text", chatId, preview: String(message).slice(0, 80), status: "sent", msgId: result.id?._serialized });
      res.json({ success: true, messageId: result.id?._serialized });
    } catch (error) {
      pushLog({ type: "text", chatId, preview: String(message).slice(0, 80), status: "failed", error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/whatsapp/send-pdf", verifyToken, upload.single("file"), async (req, res) => {
    if (clientStatus !== "ready" || !waClient) {
      return res.status(503).json({ success: false, error: `WhatsApp client not ready. Status: ${clientStatus}` });
    }
    const { chatId, caption } = req.body || {};
    if (!chatId) return res.status(400).json({ success: false, error: "chatId is required" });
    if (!req.file) return res.status(400).json({ success: false, error: "PDF file is required" });
    try {
      const media = new MessageMedia("application/pdf", req.file.buffer.toString("base64"), req.file.originalname || "invoice.pdf");
      const result = await waClient.sendMessage(chatId, media, { caption: caption || "" });
      pushLog({ type: "pdf", chatId, preview: req.file.originalname || "invoice.pdf", status: "sent", msgId: result.id?._serialized });
      res.json({ success: true, messageId: result.id?._serialized });
    } catch (error) {
      pushLog({ type: "pdf", chatId, preview: req.file?.originalname || "invoice.pdf", status: "failed", error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/whatsapp/send-booking-invoice", verifyToken, async (req, res) => {
    if (clientStatus !== "ready" || !waClient) {
      return res.status(503).json({ success: false, error: `WhatsApp client not ready. Status: ${clientStatus}` });
    }

    const { chatId, customerId, caption } = req.body || {};
    if (!chatId || !customerId) {
      return res.status(400).json({ success: false, error: "chatId and customerId are required" });
    }

    try {
      const pdfBase64 = await fetchInvoicePdfBase64(req, customerId);
      const filename = `Invoice-${customerId}.pdf`;
      const media = new MessageMedia("application/pdf", pdfBase64, filename);
      const sent = await waClient.sendMessage(chatId, media, {
        caption: caption || `Invoice for Customer ${customerId}`,
      });
      pushLog({ type: "booking-invoice", chatId, preview: filename, status: "sent", msgId: sent.id?._serialized });
      res.json({ success: true, messageId: sent.id?._serialized, filename });
    } catch (error) {
      pushLog({ type: "booking-invoice", chatId, preview: `Invoice-${customerId}.pdf`, status: "failed", error: error.message });
      logError("WHATSAPP", "Send booking invoice failed", error);
      res.status(500).json({ success: false, error: error.message || "Failed to send invoice" });
    }
  });
};
