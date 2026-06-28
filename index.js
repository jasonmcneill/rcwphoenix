const path = require("path");
const express = require("express");
const app = express();
const port = 3003;

app.set("view engine", "ejs");
app.set("views", "./app/views");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1d" }));

app.listen(port, () => console.log(`App listening on port ${port}`));
