const express = require("express");
const cors = require("cors");
const { poolmysql, poolsql } = require("./config/db");

const app = express();
app.use(express.json());
app.use(cors());

app.use("/api", require("./routes/api.routes"));

// Verificar conexión MySQL
async function testDbConnection() {
  try {
    await poolmysql.query("SELECT 1");
    console.log("✅ BASE DE DATOS MYSQL CONECTADA DESDE app.js");
  } catch (error) {
    console.error("❌ ERROR AL CONECTAR MYSQL:", error.message);
  }
}

// Verificar conexión SQL Server
async function testSqlServerConnection() {
  try {
    global.sqlServerConnection = await poolsql;
    console.log("✅ BASE DE DATOS SQL SERVER CONECTADA DESDE app.js");
  } catch (error) {
    console.error("❌ ERROR AL CONECTAR SQL SERVER:", error.message);
  }
}

testDbConnection();
testSqlServerConnection();

app.use((err, req, res, next) => {
  console.error("❌ Error en el servidor:", err.stack);
  res.status(500).json({ error: err.message });
});

module.exports = app;
