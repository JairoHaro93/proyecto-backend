const pool = require("../../config/db");

// SELECT * FROM usuarios

function selectAllUsuarios() {
  return pool.query(`
    SELECT * FROM sisusuarios`);
}

/*
// SELECT * FROM usuarios by Ida
async function selectUsuarioById(usuarioId) {
  const [usuarios] = await pool.query(
    `
SELECT * FROM sisusuarios WHERE  id = ?`,

    [usuarioId]
  );

  if (usuarios.length === 0) {
    return null;
  }
  return usuarios[0];
}
*/

// SELECT * FROM usuarios by Id
async function selectUsuarioById(usuarioId) {
  const [usuarios] = await pool.query(
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

// INSERT usuario en Usuarios
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
  return pool.query(
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

//
function updateUsuarioById(
  usuarioId,
  { nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero }
) {
  return pool.query(
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

//
function deleteUsuario(usuarioId) {
  return pool.query(`DELETE FROM  sisusuarios WHERE id = ?`, [usuarioId]);
}

module.exports = {
  selectAllUsuarios,
  selectUsuarioById,
  insertUsuario,
  updateUsuarioById,
  deleteUsuario,
};
