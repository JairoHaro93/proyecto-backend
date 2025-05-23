const { poolmysql } = require("../../config/db");

async function selectByUsuario(usuario) {
  const [result] = await poolmysql.query(
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
    U.is_auth,
    U.is_logged,
    U.is_logged_app,
    U.is_auth_app,
    JSON_ARRAYAGG(F.nombre) AS rol
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
U.usuario = ?
        
        `,
    [usuario]
  );

  if (result.length === 0) return null;
  return result[0];
}

async function selectByid(id) {
  const [rows] = await poolmysql.query(
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
      U.is_logged_app,
      U.is_auth_app,
      U.is_auth,
      U.is_logged,
      JSON_ARRAYAGG(F.nombre) AS rol
    FROM sisusuarios AS U
    INNER JOIN sisusuarios_has_sisfunciones AS UHF ON UHF.sisusuarios_id = U.id
    INNER JOIN sisfunciones AS F ON UHF.sisfunciones_id = F.id
    WHERE U.id = ?
    GROUP BY U.id
    `,
    [id]
  );

  if (!rows || rows.length === 0) return null;
  return rows[0];
}

module.exports = { selectByUsuario, selectByid };
