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



module.exports = { selectByUsuario };
