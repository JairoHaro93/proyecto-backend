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

function deleteFunciones(usuarioId) {
  return pool.query(
    ` 
     DELETE FROM sisusuarios_has_sisfunciones
     WHERE sisusuarios_id = ?;

    `,
    [usuarioId]
  );
}

module.exports = {
  selectAllFunciones,
  insertFunciones,
  deleteFunciones,
};
