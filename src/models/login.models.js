const pool = require("../config/db");

async function selectByUsuario(usuario) {
  const [result] = await pool.query(
    `
        SELECT * FROM sisusuarios WHERE usuario = ?
        
        `,
    [usuario]
  );

  if (result.length === 0) return null;
  return result[0];
}

module.exports = { selectByUsuario };
