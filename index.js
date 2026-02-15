import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import Razorpay from "razorpay";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

/* ================= FIREBASE ADMIN INIT ================= */
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

/* ================= RAZORPAY INIT ================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ================= RATE LIMIT (ANTI BOT) ================= */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
});
app.use(limiter);

/* ================= AUTH MIDDLEWARE ================= */
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

/* ================= APP CHECK VERIFY ================= */
async function verifyAppCheck(req, res, next) {
  const token = req.header("X-Firebase-AppCheck");

  if (!token)
    return res.status(401).json({ error: "No AppCheck token" });

  try {
    await admin.appCheck().verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid AppCheck token" });
  }
}

/* ================= CREATE ORDER ================= */
app.post("/create-order", verifyFirebaseAuth, verifyAppCheck, async (req, res) => {
  try {
    const { items } = req.body;

    if (!items?.length)
      return res.status(400).json({ error: "No items" });

    // Example calculation (replace with DB pricing later)
    const total = items.reduce((sum, i) => sum + 500 * i.qty, 0);

    const order = await razorpay.orders.create({
      amount: total * 100,
      currency: "INR",
      receipt: "rcpt_" + Date.now(),
    });

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= VERIFY PAYMENT ================= */
app.post("/verify-payment", verifyFirebaseAuth, verifyAppCheck, (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expected === razorpay_signature) {
      res.json({ status: "success" });
    } else {
      res.status(400).json({ status: "failed" });
    }

  } catch {
    res.status(500).json({ status: "error" });
  }
});

/* ================= REFUND ================= */
app.post("/refund", verifyFirebaseAuth, verifyAppCheck, async (req, res) => {
  try {
    const { paymentId, amount } = req.body;

    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount * 100,
    });

    res.json(refund);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MAKE ADMIN (TEMP ROUTE) ================= */
app.get("/make-admin/:uid", async (req, res) => {
  try {
    const uid = req.params.uid;

    await admin.auth().setCustomUserClaims(uid, { admin: true });

    res.send("Admin claim set successfully");

  } catch (error) {
    console.error(error);
    res.status(500).send("Error setting admin claim");
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port", PORT));
