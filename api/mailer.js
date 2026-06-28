const Mailjet = require("node-mailjet");

let client = null;

function getClient() {
  if (client) return client;
  const { MAILJET_API_KEY, MAILJET_API_SECRET } = process.env;
  if (!MAILJET_API_KEY || !MAILJET_API_SECRET) {
    throw new Error(
      "Missing MAILJET_API_KEY / MAILJET_API_SECRET environment variables.",
    );
  }
  client = Mailjet.apiConnect(MAILJET_API_KEY, MAILJET_API_SECRET);
  return client;
}

// Parse a comma/semicolon-separated env list into Mailjet recipient objects.
function parseRecipients(value) {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => ({ Email: email }));
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendContactEmail(submission) {
  const to = parseRecipients(process.env.CONTACT_RECIPIENTS);
  if (!to.length) {
    throw new Error(
      "No recipients configured. Set CONTACT_RECIPIENTS in the environment.",
    );
  }

  const fromEmail = process.env.MAILJET_FROM_EMAIL;
  if (!fromEmail) {
    throw new Error("Missing MAILJET_FROM_EMAIL environment variable.");
  }
  const fromName = process.env.MAILJET_FROM_NAME || "Website Contact Form";

  const { name, email, phone, phoneCountry, interests, comments } = submission;
  const interestsText = interests && interests.length ? interests.join(", ") : "—";

  const textBody = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || "—"}${phoneCountry ? ` (${phoneCountry})` : ""}`,
    `Interests: ${interestsText}`,
    "",
    "Comments:",
    comments || "—",
  ].join("\n");

  const htmlBody = `
    <h2>New contact form submission</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(phone) || "—"}${
      phoneCountry ? ` (${escapeHtml(phoneCountry)})` : ""
    }</p>
    <p><strong>Interests:</strong> ${escapeHtml(interestsText)}</p>
    <p><strong>Comments:</strong><br>${escapeHtml(comments).replace(/\n/g, "<br>") || "—"}</p>
  `;

  const message = {
    From: { Email: fromEmail, Name: fromName },
    To: to,
    Subject: `New contact form submission from ${name}`,
    TextPart: textBody,
    HTMLPart: htmlBody,
  };

  // Reply-To the submitter so you can respond directly.
  if (email) {
    message.ReplyTo = { Email: email, Name: name };
  }

  return getClient()
    .post("send", { version: "v3.1" })
    .request({ Messages: [message] });
}

module.exports = { sendContactEmail };
