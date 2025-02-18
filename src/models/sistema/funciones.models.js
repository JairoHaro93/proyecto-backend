const { poolmysql } = require("../../config/db");

async function selectAllFunciones() {
  return poolmysql.query("SELECT * FROM sisfunciones");
}

async function selectFuncionesById(usuarioId) {
  return poolmysql.query(
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
    return poolmysql.query(
      ` INSERT INTO sisusuarios_has_sisfunciones ( sisusuarios_id, sisfunciones_id) VALUES ( ?, ?);`,
      [usuarioId, element]
    );
  });
}

async function deleteFunciones(usuarioId) {
  return poolmysql.query(
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
