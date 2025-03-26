const { poolmysql } = require("../../config/db");

// QUERY PARA OBTENER LA AGENDA DE UNA FECHA EN ESPECIFICO
async function selectAgendByFecha(soporteId) {
  const [soportes] = await poolmysql.query(
    `
    SELECT 
        Sop.id,
        Sop.ord_ins,
        Sop.reg_sop_opc,
        Sop.cli_tel,
        Sop.reg_sop_registrado_por_id,
        CONCAT(U.nombre, ' ', U.apellido) AS reg_sop_registrado_por_nombre,
        Sop.reg_sop_observaciones,
        Sop.reg_sop_fecha,
        Sop.reg_sop_estado,
        Sop.reg_sop_nombre,
        Sop.reg_sop_fecha_acepta,
         Sop.reg_sop_coordenadas,
         Sop.reg_sop_sol_det
    FROM
        neg_t_soportes AS Sop
    LEFT JOIN sisusuarios AS U ON Sop.reg_sop_registrado_por_id = U.id
    WHERE  
        Sop.id = ?;
    
    
    `,
    [soporteId]
  );

  if (soportes.length === 0) {
    return null;
  }
  return soportes[0];
}

module.exports = { selectAgendByFecha };
