const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, default: "General" },
  isAvailable: { type: Boolean, default: true }
}, { timestamps: true });

const OrderSchema = new mongoose.Schema({
  table: { type: String, required: true },
  items: [{ name: String, price: Number, qty: Number }],
  customerNote: { type: String, default: "" },
  status: { type: String, default: "pending" }
}, { timestamps: true });

const MenuItem = mongoose.model("MenuItem", MenuItemSchema);
const Order = mongoose.model("Order", OrderSchema);

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.get("/api/menu", async (req, res) => {
  const items = await MenuItem.find({ isAvailable: true }).sort({ category: 1, name: 1 });
  res.json(items);
});

app.post("/api/admin/seed-menu", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items required" });
  await MenuItem.deleteMany({});
  await MenuItem.insertMany(items.map(x => ({
    name: x.name,
    price: Number(x.price),
    category: x.category || "General",
    isAvailable: true
  })));
  res.json({ ok: true, count: items.length });
});

app.get("/api/orders", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 }).limit(200);
  res.json(orders);
});

app.post("/api/orders", async (req, res) => {
  const { table, items, customerNote } = req.body;
  if (!table || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "table and items required" });
  }

  const cleanItems = items.map(it => ({
    name: String(it.name || ""),
    price: Number(it.price || 0),
    qty: Number(it.qty || 1)
  })).filter(it => it.name && it.qty > 0);

  if (cleanItems.length === 0) return res.status(400).json({ error: "invalid items" });

  const order = await Order.create({
    table: String(table),
    items: cleanItems,
    customerNote: (customerNote || "").toString()
  });

  res.json({ ok: true, orderId: order._id });
});

app.patch("/api/orders/:id", async (req, res) => {
  const { status } = req.body;
  const allowed = ["pending", "preparing", "ready", "served", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "invalid status" });

  const updated = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!updated) return res.status(404).json({ error: "order not found" });

  res.json({ ok: true });
});

async function start() {
  if (!MONGODB_URI) {
    console.error("? Missing MONGODB_URI environment variable");
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  console.log("? MongoDB connected");

  app.listen(PORT, () => console.log(? Server running on port ));
}

start().catch(err => {
  console.error("? Failed to start:", err);
  process.exit(1);
});
