const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const contactRouter = require("./api/contact");
const youtubeRouter = require("./api/youtube-latest-sermon");
const app = express();
const port = 3003;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));

app.get("/contact.html", (req, res) => res.redirect(301, "/contact/"));
app.get("/videos.html", (req, res) => res.redirect(301, "/videos/"));

app.use("/api/contact", contactRouter);
app.use("/api/youtube-latest-sermon", youtubeRouter);

app.listen(port, () => console.log(`App listening on port ${port}`));
