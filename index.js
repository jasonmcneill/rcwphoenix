const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const contactRouter = require("./api/contact");
const app = express();
const port = 3003;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));

app.use("/api/contact", contactRouter);

app.listen(port, () => console.log(`App listening on port ${port}`));
