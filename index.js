import express from "express";
import Razorpay from "razorpay";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import admin from "firebase-admin";

dotenv.config();
const app = express();

/* ================= CORS SECURITY ================= */
app.use(cors({
  origin: ["https://infinitecollection.in.net"], // 🔁 put real domain
}));

app.use(express.json());

/* ================= FIREBASE ADMIN ================= */
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replcae(/\n/g,"\n"),
  }),
});

const db = admin.firestore();

/* ================= RAZORPAY ================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ================= HEALTH ================= */
app.get("/", (_, res) => res.send("Backend Secure 🚀"));

/* ================= CREATE ORDER (SERVER PRICE) ================= */
app.post("/create-order", async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ error: "No items" });

    let total = 0;

    for (const item of items) {
      const snap = await db.collection("products").doc(item.id).get();
      if (!snap.exists) continue;

      const product = snap.data();
      total += Number(product.price) * Number(item.qty || 1);
    }

    const order = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
    });

    res.json({ id: order.id, amount: order.amount });

  } catch (err) {
    res.status(500).json({ error: "Order failed" });
  }
});

/* ================= VERIFY PAYMENT ================= */
app.post("/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (expected !== razorpay_signature)
    return res.status(400).json({ status: "failed" });

  res.json({ status: "success" });
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});



