const { poolmysql } = require("../../config/db");

// OBTENER TODOS LOS USUARIOS
function selectAllUsuarios() {
  return poolmysql.query(`
    SELECT * FROM sisusuarios`);
}

// OBTENER USUARIO POR ID
async function selectUsuarioById(usuarioId) {
  const [usuarios] = await poolmysql.query(
    `
    SELECT 
    U.id,
    U.nombre,
    U.apellido,
    U.ci,
    U.usuario,
    U.password,
    U.fecha_nac,
    U.fecha_cont,
    U.genero,
    JSON_ARRAYAGG(F.id) AS rol
FROM
    sisusuarios AS U

INNER JOIN
    sisusuarios_has_sisfunciones AS UHF
ON  
    UHF.sisusuarios_id = U.id
INNER JOIN
    sisfunciones AS F
ON 
    UHF.sisfunciones_id = F.id
WHERE  
U.id = ?`,
    [usuarioId]
  );

  if (usuarios.length === 0) {
    return null;
  }
  return usuarios[0];
}

// OBTENER TODOS LOS USUARIOS CON AGENDA-TECNICOS
function selectAllAgendaTecnicos() {
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
function insertUsuario({
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
function updateUsuarioById(
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
function deleteUsuario(usuarioId) {
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
