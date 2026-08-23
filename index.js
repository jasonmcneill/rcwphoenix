const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const contactRouter = require("./api/contact");
const youtubeRouter = require("./api/youtube-sermons");
const invitationRouter = require("./api/invitation");
const app = express();
const port = 3003;

app.set("views", path.join(__dirname, "public"));
app.set("view engine", "ejs");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css)$/.test(filePath)) {
        // Always revalidate with the server so edits show up immediately;
        // ETag/Last-Modified still let unchanged files return a cheap 304.
        res.setHeader("Cache-Control", "no-cache");
      } else if (filePath.endsWith(".css")) {
        res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
      } else {
        // images and other static assets change rarely; cache longer but
        // still force a revalidation check once the cache expires.
        res.setHeader(
          "Cache-Control",
          "public, max-age=86400, must-revalidate",
        );
      }
    },
  }),
);

app.get("/contact.html", (req, res) => res.redirect(301, "/contact/"));
app.get("/videos.html", (req, res) => res.redirect(301, "/sermons/"));
app.get("/videos/", (req, res) => res.redirect(301, "/sermons/"));

app.get("/invitation/", (req, res) => res.render("invitation/index"));
app.get("/invitation/:sender", (req, res) =>
  res.render("invitation/sender/index"),
);

app.use("/api/contact", contactRouter);
app.use("/api/youtube-sermons", youtubeRouter);
app.use("/api/invitation", invitationRouter);

app.listen(port, () => console.log(`App listening on port ${port}`));
