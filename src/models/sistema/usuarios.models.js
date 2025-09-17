const { poolmysql } = require("../../config/db");

// OBTENER TODOS LOS USUARIOS
function selectAllUsuarios() {
  return poolmysql.query(`
    SELECT * FROM sisusuarios`);
}

// OBTENER USUARIO POR ID
// usuarios.models.js
async function selectUsuarioById(usuarioId) {
  const [usuarios] = await poolmysql.query(
    `
    SELECT 
      U.id,
      U.nombre,
      U.apellido,
      U.ci,
      U.usuario,
      U.fecha_nac,
      U.fecha_cont,
      U.genero,
      COALESCE(JSON_ARRAYAGG(F.id), JSON_ARRAY()) AS rol
    FROM sisusuarios AS U
    LEFT JOIN sisusuarios_has_sisfunciones AS UHF
      ON UHF.sisusuarios_id = U.id
    LEFT JOIN sisfunciones AS F
      ON UHF.sisfunciones_id = F.id
    WHERE U.id = ?
    GROUP BY U.id, U.nombre, U.apellido, U.ci, U.usuario, U.fecha_nac, U.fecha_cont, U.genero
    `,
    [usuarioId]
  );

  if (usuarios.length === 0) return null;
  return usuarios[0];
}

// OBTENER TODOS LOS USUARIOS CON AGENDA-TECNICOS
async function selectAllAgendaTecnicos() {
  const query = `
    SELECT u.id, u.nombre, u.apellido
    FROM sisusuarios_has_sisfunciones uhf
    JOIN sisusuarios u ON uhf.sisusuarios_id = u.id
    WHERE uhf.sisfunciones_id = 7;
  `;
  return poolmysql
    .query(query)
    .then(([rows]) => rows)
    .catch((error) => {
      console.error("Error en la consulta SQL:", error);
      throw error;
    });
}

// CREAR USUARIO
async function insertUsuario({
  nombre,
  apellido,
  ci,
  usuario,
  password,
  fecha_nac,
  fecha_cont,
  genero,
}) {
  return poolmysql.query(
    ` INSERT INTO sisusuarios (
  
    nombre,
    apellido,
    ci,
    usuario,
    password,
    fecha_nac,
    fecha_cont,
    genero
 
) VALUES (
  
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   ?
);`,
    [nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero]
  );
}

// ACTUALIZAR USUARIOS
async function updateUsuarioById(
  usuarioId,
  { nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero }
) {
  return poolmysql.query(
    `
    UPDATE sisusuarios SET 
    nombre = ? ,
    apellido = ?,
    ci = ?,
    usuario = ?,
    password = ?,
    fecha_nac = ?, 
    fecha_cont = ?, 
    genero = ?
    WHERE id=?
    `,
    [
      nombre,
      apellido,
      ci,
      usuario,
      password,
      fecha_nac,
      fecha_cont,
      genero,
      usuarioId,
    ]
  );
}

//BORRAR USUARIO
async function deleteUsuario(usuarioId) {
  return poolmysql.query(`DELETE FROM  sisusuarios WHERE id = ?`, [usuarioId]);
}

module.exports = {
  selectAllUsuarios,
  selectUsuarioById,
  selectAllAgendaTecnicos,
  insertUsuario,
  updateUsuarioById,
  deleteUsuario,
};
