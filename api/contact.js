const express = require("express");
const router = express.Router();
const { sendContactEmail } = require("./mailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/", async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const phoneCountry =
    typeof body.phoneCountry === "string" ? body.phoneCountry.trim() : "";
  const interests = Array.isArray(body.interests) ? body.interests : [];
  const comments =
    typeof body.comments === "string" ? body.comments.trim() : "";

  const errors = {};
  if (!name) errors.name = "Please enter your name.";
  if (!email) errors.email = "Please enter your email.";
  else if (!EMAIL_RE.test(email))
    errors.email = "Please enter a valid email address.";

  if (Object.keys(errors).length) {
    return res.status(400).json({ ok: false, errors });
  }

  const submission = {
    name,
    email,
    phone,
    phoneCountry,
    interests,
    comments,
  };

  try {
    await sendContactEmail(submission);
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to send contact email:", err);
    res.status(500).json({ ok: false, error: "Failed to send message." });
  }
});

module.exports = router;
