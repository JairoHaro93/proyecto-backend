const pool = require("../config/db");

// SELECT * FROM usuarios
function selectAllUsuarios() {
  return pool.query("SELECT * FROM Usuarios");
}

// SELECT * FROM usuarios by Ida
async function selectUsuarioById(usuarioId) {
  const [usuarios] = await pool.query(
    "SELECT * FROM Usuarios WHERE idUsuarios = ?",
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
  rol,
}) {
  return pool.query(
    ` INSERT INTO Usuarios (
  
    nombre,
    apellido,
    ci,
    usuario,
    password,
    fecha_nac,
    fecha_cont,
    genero,
    rol
) VALUES (
  
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   ?
);`,
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
    ]
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
    UPDATE Usuarios SET 
    nombre = ? ,
    apellido = ?,
    ci = ?,
    usuario = ?,
    password = ?,
    fecha_nac = ?, 
    fecha_cont = ?, 
    genero = ?,
    rol = ?

    WHERE idUsuarios=?

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
  return pool.query(`DELETE FROM  Usuarios WHERE idUsuarios = ?`, [usuarioId]);
}

module.exports = {
  selectAllUsuarios,
  selectUsuarioById,
  insertUsuario,
  updateUsuarioById,
  deleteUsuario,
};
