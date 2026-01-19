const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// ✅ Admin credentials (fixed as you asked)
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "kdresort";

// ===== middleware =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== Basic Auth middleware (admin only) =====
function basicAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
    return res.status(401).send("Authentication required");
  }

  const base64 = header.split(" ")[1];
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  const [user, pass] = decoded.split(":");

  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();

  res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"');
  return res.status(401).send("Invalid credentials");
}

// ===== Mongo Models =====
const MenuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, default: "General" },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const OrderSchema = new mongoose.Schema(
  {
    table: { type: String, required: true },
    items: [{ name: String, price: Number, qty: Number }],
    customerNote: { type: String, default: "" },
    status: { type: String, default: "pending" }, // pending|preparing|ready|served|cancelled
  },
  { timestamps: true }
);

const MenuItem = mongoose.model("MenuItem", MenuItemSchema);
const Order = mongoose.model("Order", OrderSchema);

// ===== Pages =====
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

// ✅ Admin page protected
app.get("/admin", basicAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "public", "admin.html"))
);

// ===== API =====

// Public menu
app.get("/api/menu", async (req, res) => {
  const items = await MenuItem.find({ isAvailable: true }).sort({
    category: 1,
    name: 1,
  });
  res.json(items);
});

// Admin: seed menu (protected)
app.post("/api/admin/seed-menu", basicAuth, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items required" });
  }
  await MenuItem.deleteMany({});
  await MenuItem.insertMany(
    items.map((x) => ({
      name: String(x.name || "").trim(),
      price: Number(x.price || 0),
      category: String(x.category || "General").trim(),
      isAvailable: x.isAvailable === false ? false : true,
    }))
  );
  res.json({ ok: true, count: items.length });
});

// Admin: get orders (protected)
app.get("/api/orders", basicAuth, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(300);
  res.json(orders);
});

// Customer: place order (public)
app.post("/api/orders", async (req, res) => {
  const { table, items, customerNote } = req.body;

  if (!table || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "table and items required" });
  }

  const cleanItems = items
    .map((it) => ({
      name: String(it.name || "").trim(),
      price: Number(it.price || 0),
      qty: Number(it.qty || 1),
    }))
    .filter((it) => it.name && it.qty > 0);

  if (cleanItems.length === 0) return res.status(400).json({ error: "invalid items" });

  const order = await Order.create({
    table: String(table),
    items: cleanItems,
    customerNote: (customerNote || "").toString(),
  });

  res.json({ ok: true, orderId: order._id });
});

// Admin: update status (protected)
app.patch("/api/orders/:id", basicAuth, async (req, res) => {
  const { status } = req.body;
  const allowed = ["pending", "preparing", "ready", "served", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "invalid status" });

  const updated = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!updated) return res.status(404).json({ error: "order not found" });

  res.json({ ok: true });
});

// ✅ Admin: delete order (protected)
app.delete("/api/orders/:id", basicAuth, async (req, res) => {
  const deleted = await Order.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: "order not found" });
  res.json({ ok: true });
});

// ===== Auto seed menu from menu.json (first run) =====
async function autoSeedMenuIfEmpty() {
  try {
    const count = await MenuItem.countDocuments();
    if (count > 0) return;

    const menuPath = path.join(__dirname, "menu.json");
    if (!fs.existsSync(menuPath)) return;

    const raw = fs.readFileSync(menuPath, "utf8");
    const items = JSON.parse(raw);

    if (Array.isArray(items) && items.length > 0) {
      await MenuItem.insertMany(
        items.map((x) => ({
          name: String(x.name || "").trim(),
          price: Number(x.price || 0),
          category: String(x.category || "General").trim(),
          isAvailable: x.isAvailable === false ? false : true,
        }))
      );
      console.log(`✅ Menu auto-seeded from menu.json (${items.length} items)`);
    }
  } catch (e) {
    console.log("⚠️ Auto-seed skipped:", e.message);
  }
}

async function start() {
  if (!MONGODB_URI) {
    console.error("❌ Missing MONGODB_URI environment variable");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("✅ MongoDB connected");

  await autoSeedMenuIfEmpty();

  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
}

start().catch((err) => {
  console.error("❌ Failed to start:", err);
  process.exit(1);
});
