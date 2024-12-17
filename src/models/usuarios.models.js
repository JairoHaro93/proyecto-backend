const pool = require("../config/db");

// SELECT * FROM usuarios
function selectAllUsuarios() {
  return pool.query("SELECT * FROM Usuarios");
}

module.exports = { selectAllUsuarios };
