const mysql = require("mysql2");
const sql = require("mssql");
const dotenv = require("dotenv");
dotenv.config();

// Conexión a MySQL
const poolmysql = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Conexión a SQL Server
const poolsql = new sql.ConnectionPool({
  user: process.env.DB_SQL_USER,
  password: process.env.DB_SQL_PASSWORD,
  port: Number(process.env.DB_SQL_PORT),
  server: process.env.DB_SQL_SERVER,
  database: process.env.DB_SQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
}).connect();

module.exports = {
  poolmysql: poolmysql.promise(),
  poolsql,
};
