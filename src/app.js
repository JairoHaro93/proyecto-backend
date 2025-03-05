const express = require("express");
const cors = require("cors");
const { connectDB, sql } = require("./config/db");

const app = express();
app.use(express.json());
app.use(cors());

app.use("/api", require("./routes/api.routes"));

app.use((err, req, res, next) => {
  console.error("❌ Error en el servidor:", err.stack);
  res.status(500).json({ error: err.message });
});

module.exports = app;
//
