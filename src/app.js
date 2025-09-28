// app.js
"use strict";

const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const { poolmysql, poolsql } = require("./config/db");

dotenv.config();

const app = express();

// ----- CORS -----
app.use(
  cors({
    origin: process.env.IP, // ajusta a tu origen (o lista) según tu despliegue
    credentials: true,
  })
);

// ----- Estáticos de imágenes -----
// Sirve TODAS las imágenes desde la RAÍZ de uploads (no un subfolder).
const IMAGES_ROOT = path.resolve(process.env.RUTA_DESTINO || "uploads");
console.log("[imagenes] raiz:", IMAGES_ROOT);

app.use(
  "/imagenes",
  express.static(IMAGES_ROOT, {
    index: false,
    maxAge: "1d",
  })
);

// ----- Cache-Control global (excluye /imagenes para permitir cachear estáticos) -----
app.use((req, res, next) => {
  if (!req.path.startsWith("/imagenes")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// ----- Parsers -----
app.use(cookieParser());
app.use(express.json());

// ----- Rutas API -----
// Nuevo router de imágenes estandarizado
app.use("/api/images", require("./routes/api/negocio_lat/images.router"));

// Resto de rutas del proyecto
app.use("/api", require("./routes/api.routes"));

// ----- Conexión a BDs -----
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

// ----- Middleware de errores -----
app.use((err, _req, res, _next) => {
  console.error("❌ Error en el servidor:", err.stack || err.message);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

module.exports = app;
