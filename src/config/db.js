const mysql = require("mysql2");
const sql = require("mssql");
require("dotenv").config();

// CONFIGURACIÓN DE LA CONEXIÓN MYSQL
const poolmysql = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Verificar la conexión MySQL
poolmysql.query("SELECT 1", (err, results) => {
  if (err) {
    console.error("❌ ERROR AL CONECTAR MYSQL:", err.message);
  } else {
    console.log("✅ BASE DE DATOS MYSQL CONECTADA !!!");
  }
});

// CONFIGURACIÓN DE LA CONEXIÓN SQL SERVER
const configSQL = {
  user: process.env.SQL_USER || "sa",
  password: process.env.SQL_PASSWORD || "sqlserverjairo",
  port: process.env.SQL_PORT || 1433,
  server: process.env.SQL_SERVER || `192.168.0.160`,
  database: process.env.SQL_DATABASE || "REDECOM_BDD",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// Función para conectar SQL Server
async function connectDB() {
  try {
    const poolsql = await sql.connect(configSQL);
    console.log("✅ BASE DE DATOS SQL SERVER CONECTADA!");
    return poolsql;
  } catch (err) {
    console.error("❌ ERROR AL CONECTAR SQL SERVER:", err.message);
    throw err;
  }
}

module.exports = { poolmysql: poolmysql.promise(), connectDB, sql };
