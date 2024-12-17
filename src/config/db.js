const mysql = require("mysql2");

require("dotenv").config();
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Verificar la conexión
pool.query("SELECT 1", (err, results) => {
  if (err) {
    console.error("ERROR AL CONECTAR LA BASE DE DATOS", err.message);
  } else {
    console.log("BASE DE DATOS CONECTADA !!!");
  }
});

module.exports = pool.promise();
