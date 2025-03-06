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
  user: process.env.DB_SQL_USER,
  password: process.env.DB_SQL_PASSWORD,
  port: Number(process.env.DB_SQL_PORT),
  server: process.env.DB_SQL_SERVER,
  database: process.env.DB_SQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 segundos

async function connectDB(retries = 0) {
  try {
    const poolsql = await sql.connect(configSQL);
    console.log("✅ BASE DE DATOS SQL SERVER CONECTADA!");
    return poolsql;
  } catch (err) {
    console.error(
      `❌ ERROR AL CONECTAR SQL SERVER (Intento ${retries + 1}):`,
      err.message
    );
    if (retries < MAX_RETRIES) {
      console.log(
        `🔄 Reintentando conexión en ${RETRY_DELAY / 1000} segundos...`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return connectDB(retries + 1);
    } else {
      console.error("❌ Se agotaron los intentos de conexión a SQL Server.");
      throw err;
    }
  }
}

// Prueba de conexión con reintento automático
connectDB();

module.exports = { poolmysql: poolmysql.promise(), connectDB, sql };
