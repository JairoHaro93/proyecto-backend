const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { poolmysql, poolsql } = require("./config/db");
require("dotenv").config();
const app = express();

app.use(
  cors({
    origin: "http://localhost:4200",
    // origin: process.env.IP,
    //   origin: process.env.IP, // fallback útil
    credentials: true,
  })
);

console.log("La ip en app es " + process.env.IP);

app.use(cookieParser());
app.use(express.json());
app.use("/api", require("./routes/api.routes"));

// Conexión a BDs
(async () => {
  try {
    await poolmysql.query("SELECT 1");
    console.log("✅ BASE DE DATOS MYSQL CONECTADA");

    global.sqlServerConnection = await poolsql;
    console.log("✅ BASE DE DATOS SQL SERVER CONECTADA");
  } catch (error) {
    console.error("❌ Error al conectar BDs:", error.message);
  }
})();

// Middleware errores
app.use((err, req, res, next) => {
  console.error("❌ Error en el servidor:", err.stack);
  res.status(500).json({ error: err.message });
});

module.exports = app;
