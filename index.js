import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= CORS ================= */
app.use(cors({
  origin: [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://infinitecollection.in.net"
  ],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Infinite Collection Backend Running 🚀");
});

/* ================= FIREBASE ================= */
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

/* ================= RAZORPAY ================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ================= AUTH ================= */
async function verifyFirebaseAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ================= CREATE ORDER ================= */
app.post("/create-order", verifyFirebaseAuth, async (req, res) => {
  try {

    const { items } = req.body;

    if (!items || !items.length)
      return res.status(400).json({ error: "No items provided" });

    let subtotal = 0;

    items.forEach(item => {
      const price = Number(item.price) || 0;
      const qty = Number(item.qty) || 1;
      subtotal += price * qty;
    });

    const delivery = subtotal >= 1200 ? 0 : 79;
    const total = subtotal + delivery;

    const order = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: "order_" + Date.now()
    });

    res.json({
      id: order.id,
      amount: order.amount
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

/* ================= VERIFY PAYMENT ================= */
app.post("/verify-payment", verifyFirebaseAuth, (req, res) => {

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest("hex");

  if (expected === razorpay_signature) {

    res.json({
      status: "success",
      orderId: razorpay_order_id
    });

  } else {

    res.status(400).json({
      status: "failed"
    });

  }

});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
