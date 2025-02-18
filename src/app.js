const express = require("express");
const cors = require("cors");
const { connectDB, sql } = require("./config/db");

/*
async function getUsers() {
  let pool = await connectDB();
  if (!pool) return;

  try {
    let result = await pool.request().query("SELECT * FROM t_Tabla_Prueba_1");
    console.log(result.recordset);
  } catch (err) {
    console.error("❌ Error al ejecutar la consulta:", err);
  }
}

getUsers();
*/
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
