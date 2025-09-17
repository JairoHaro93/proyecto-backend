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
/*
async function insertFunciones(usuarioId, funcionesId) {
  const insertQueries = funcionesId.map((funcId) =>
    poolmysql.query(
      `INSERT INTO sisusuarios_has_sisfunciones (sisusuarios_id, sisfunciones_id) VALUES (?, ?)`,
      [usuarioId, funcId]
    )
  );

  return Promise.all(insertQueries);
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
*/

// funciones.models.js (opcional, si quieres reutilizarlas con conn)
async function insertFunciones(conn, usuarioId, funcionesId) {
  const roles = (funcionesId || [])
    .map((r) => Number(r))
    .filter((n) => Number.isInteger(n));

  if (roles.length === 0) return;

  const values = roles.map(() => "(?, ?)").join(", ");
  const params = roles.flatMap((rid) => [usuarioId, rid]);
  await conn.query(
    `INSERT INTO sisusuarios_has_sisfunciones (sisusuarios_id, sisfunciones_id) VALUES ${values}`,
    params
  );
}

async function deleteFunciones(conn, usuarioId) {
  await conn.query(
    `DELETE FROM sisusuarios_has_sisfunciones WHERE sisusuarios_id = ?`,
    [usuarioId]
  );
}

module.exports = {
  selectAllFunciones,
  selectFuncionesById,
  insertFunciones,
  deleteFunciones,
};
