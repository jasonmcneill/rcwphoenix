const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  const body = req.body || {};
  const invitedBy = Number(body.invitedby);

  if (!Number.isInteger(invitedBy) || invitedBy <= 0) {
    return res.status(400).json({
      ok: false,
      error: "invitedby must be a positive integer.",
    });
  }

  // TODO: look up the inviting member by `invitedBy` and populate the
  // response below from that record instead of this dummy value.
  res.json({
    headshotUrl: "https://mockmind-api.uifaces.co/content/human/80.jpg",
    name: "John Smith",
    message:
      "Hi, it's John Smith. I just invited you to one of the events above. I thought I would introduce myself.",
    youtubeId: "dQw4w9WgXcQ",
  });
});

module.exports = router;
