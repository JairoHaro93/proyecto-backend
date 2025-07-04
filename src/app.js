const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { poolmysql, poolsql } = require("./config/db");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config();

const app = express();

app.use(
  cors({
    //origin: "http://localhost:4200",
    origin: process.env.IP,
    credentials: true,
  })
);

console.log("🌐 IP del frontend permitida por CORS:", process.env.IP);

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(cookieParser());
app.use(express.json());
app.use(
  "/imagenes",
  express.static(path.resolve(process.env.RUTA_DESTINO || "uploads/soluciones"))
);
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
