const pool = require("../../config/db");

async function selectAllFunciones() {
  return pool.query("SELECT * FROM sisfunciones");
}

async function selectFuncionesById(usuarioId) {
  return pool.query(
    `SELECT f.nombre AS funcion
FROM sisusuarios_has_sisfunciones uf
INNER JOIN sisfunciones f ON uf.sisfunciones_id = f.id
WHERE uf.sisusuarios_id = ?;`,
    [usuarioId]
  );
}

// INSERT usuario en Usuarios

async function insertFunciones(usuarioId, funcionesId) {
  funcionesId.forEach((element) => {
    return pool.query(
      ` INSERT INTO sisusuarios_has_sisfunciones ( sisusuarios_id, sisfunciones_id) VALUES ( ?, ?);`,
      [usuarioId, element]
    );
  });
}

async function deleteFunciones(usuarioId) {
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
  selectFuncionesById,
  insertFunciones,
  deleteFunciones,
};
