const pool = require("../../config/db");

async function selectAllFunciones() {
  return pool.query("SELECT * FROM sisfunciones");
}

// INSERT usuario en Usuarios

function insertFunciones(usuarioId, funcionesId) {
  funcionesId.forEach((element) => {
    return pool.query(
      ` INSERT INTO sisusuarios_has_sisfunciones ( sisusuarios_id, sisfunciones_id) VALUES ( ?, ?);`,
      [usuarioId, element]
    );
  });
}

module.exports = { selectAllFunciones, insertFunciones };
