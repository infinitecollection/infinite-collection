import nodemailer from "nodemailer";
import express from "express";
import Razorpay from "razorpay";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();
const app = express();

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

/* ================= EMAIL SETUP ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASS
  }
});

/* ================= RAZORPAY ================= */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* ================= TEST ROUTE ================= */
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

/* ================= CREATE ORDER ================= */
app.post("/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0)
      return res.status(400).json({ error: "Invalid amount" });

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR"
    });

    res.json(order);

  } catch (err) {
    console.log("CREATE ORDER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= VERIFY PAYMENT ================= */
app.post("/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {

      /* 📧 SEND EMAIL AFTER SUCCESS PAYMENT */
      try {
        await transporter.sendMail({
          from: `"Infinite Collection" <${process.env.ADMIN_EMAIL}>`,
          to: process.env.ADMIN_EMAIL,
          subject: "🛒 Payment Successful - New Order",
          html: `
            <h2>Payment Successful</h2>
            <p><b>Order ID:</b> ${razorpay_order_id}</p>
            <p><b>Payment ID:</b> ${razorpay_payment_id}</p>
          `
        });

        console.log("✅ EMAIL SENT SUCCESSFULLY");

      } catch (mailErr) {
        console.log("❌ EMAIL ERROR:", mailErr);
      }

      res.json({ status: "success" });

    } else {
      res.json({ status: "failed" });
    }

  } catch (err) {
    console.log("VERIFY ERROR:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log("Server running on port", PORT)
);
