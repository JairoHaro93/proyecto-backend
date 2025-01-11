const pool = require("../../config/db");

// SELECT * FROM usuarios
function selectAllUsuarios() {
  return pool.query("SELECT * FROM sisusuarios");
}

// SELECT * FROM usuarios by Ida
async function selectUsuarioById(usuarioId) {
  const [usuarios] = await pool.query(
<<<<<<< HEAD:src/models/sistema/usuarios.models.js
    `
SELECT * FROM sisusuarios WHERE  id = ?`,
=======
    "SELECT * FROM sisusuarios WHERE id = ?",
>>>>>>> main:src/models/usuarios.models.js
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
  {
    nombre,
    apellido,
    ci,
    usuario,
    password,
    fecha_nac,
    fecha_cont,
    genero,
    rol,
  }
) {
  return pool.query(
    `
<<<<<<< HEAD:src/models/sistema/usuarios.models.js
    UPDATE sissuarios SET 
=======
    UPDATE sisusuarios SET 
>>>>>>> main:src/models/usuarios.models.js
    nombre = ? ,
    apellido = ?,
    ci = ?,
    usuario = ?,
    password = ?,
    fecha_nac = ?, 
    fecha_cont = ?, 
    genero = ?,
    rol = ?

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
      rol,
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
