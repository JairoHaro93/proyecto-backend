const { poolmysql } = require("../../config/db");

// QUERY PARA OBTENER LOS SOPORTES CREADOS
function selectAllSoportes() {
  return poolmysql.query(`
    SELECT * FROM neg_t_soportes`);
}

// QUERY PARA OBTENER LOS SOPORTES PENDIENTES  --PAGINA SOPORTES PENDIENTES /home/noc/soporte-tecnico
function selectAllSoportesPendientes() {
  return poolmysql.query(`
 SELECT 
    Sop.id,
    Sop.ord_ins,
    Sop.reg_sop_opc,
    Sop.reg_sop_tel,
    Sop.reg_sop_registrado_por_id,
    CONCAT(U.nombre, ' ', U.apellido) AS reg_sop_registrado_por_nombre,
    Sop.reg_sop_observaciones,
    Sop.reg_sop_fecha,
    Sop.reg_sop_estado,
    Sop.reg_sop_nombre
FROM
    neg_t_soportes AS Sop
LEFT JOIN sisusuarios AS U ON Sop.reg_sop_registrado_por_id = U.id
WHERE  
    Sop.reg_sop_fecha_acepta IS NULL;


      `);
}

// QUERY PARA OBTENER UN SOPORTE POR ID
async function selectSoporteById(id_sop) {
  const [soportes] = await poolmysql.query(
    `
  SELECT 
      Sop.id,
      Sop.ord_ins,
      Sop.reg_sop_opc,
      Sop.reg_sop_tel,
      Sop.reg_sop_registrado_por_id,
      CONCAT(U.nombre, ' ', U.apellido) AS reg_sop_registrado_por_nombre,
      Sop.reg_sop_observaciones,
      Sop.reg_sop_fecha,
      Sop.reg_sop_estado,
      Sop.reg_sop_nombre,
      Sop.reg_sop_fecha_acepta,
      Sop.reg_sop_sol_det
  FROM
      neg_t_soportes AS Sop
  LEFT JOIN sisusuarios AS U ON Sop.reg_sop_registrado_por_id = U.id
  WHERE  
      Sop.id = ?;
  
  
  `,
    [id_sop]
  );

  if (soportes.length === 0) {
    return null;
  }
  return soportes[0];
}

// QUERY PARA OBTENER UN SOPORTE POR ORDINS   --PAGINA INFO-SOP  /home/noc/info-sop/99847
async function selectSoporteByOrdIns(soporteOrdIns) {
  const [soportes] = await poolmysql.query(
    `
    SELECT 
        Sop.id,
        Sop.ord_ins,
        Sop.reg_sop_opc,
        Sop.reg_sop_tel,
        Sop.reg_sop_registrado_por_id,
        CONCAT(U.nombre, ' ', U.apellido) AS reg_sop_registrado_por_nombre,
        Sop.reg_sop_observaciones,
        Sop.reg_sop_fecha,
        Sop.reg_sop_estado,
        Sop.reg_sop_nombre,
        Sop.reg_sop_fecha_acepta,
        Sop.reg_sop_sol_det
    FROM
        neg_t_soportes AS Sop
    LEFT JOIN sisusuarios AS U ON Sop.reg_sop_registrado_por_id = U.id
    WHERE  
        Sop.ord_ins = ?
    ORDER BY Sop.id DESC; 
    `,
    [soporteOrdIns]
  );

  return soportes;
}

// QUERY PARA OBTENER TODOS LOS SOPORTES ACEPTADOS POR NOC
async function selectSoportesByNoc(id_noc) {
  const [soportes] = await poolmysql.query(
    `
SELECT 
    Sop.id,
    Sop.ord_ins,
    Sop.reg_sop_opc,
    Sop.reg_sop_tel,
    Sop.reg_sop_registrado_por_id,
    CONCAT(U.nombre, ' ', U.apellido) AS reg_sop_registrado_por_nombre,
    Sop.reg_sop_observaciones,
    Sop.reg_sop_fecha,
    Sop.reg_sop_fecha_acepta,
    Sop.reg_sop_estado,
    Sop.reg_sop_nombre,
    Sop.reg_sop_noc_id_acepta
FROM
    neg_t_soportes AS Sop
LEFT JOIN 
    sisusuarios AS U 
    ON Sop.reg_sop_registrado_por_id = U.id
WHERE  
    Sop.reg_sop_noc_id_acepta = ? 
    AND Sop.reg_sop_estado NOT IN ('RESUELTO');

  `,
    [id_noc]
  );

  if (soportes.length === 0) {
    return null; // O podrías devolver un array vacío [] si prefieres.
  }
  return soportes; // DEVOLVER TODOS LOS REGISTROS, NO SOLO EL PRIMERO
}

// QUERY PARA CREAR UN SOPORTE NUEVO        --PAGINA REGISTRAR SOPORTE /home/tecnico/registrosop
function insertSoporte({
  ord_ins,
  reg_sop_opc,
  reg_sop_tel,
  reg_sop_registrado_por_id,
  reg_sop_observaciones,
  reg_sop_nombre,
}) {
  return poolmysql.query(
    `INSERT INTO neg_t_soportes (
        ord_ins,
        reg_sop_opc,
        reg_sop_tel,
        reg_sop_registrado_por_id,
        reg_sop_observaciones,
        reg_sop_nombre,
        reg_sop_fecha
      ) VALUES (?, ?, ?, ?, ?, ? , NOW());`, // NOW() insertará la fecha y hora actuales
    [
      ord_ins,
      reg_sop_opc,
      reg_sop_tel,
      reg_sop_registrado_por_id,
      reg_sop_observaciones,
      reg_sop_nombre,
    ]
  );
}

// QUERY PARA ACTUALIZAR LA SOLUCION  --PAGINA INFO-SOP  /home/noc/info-sop/99847
async function updateAsignarSolucion(
  soporteId,
  { reg_sop_estado, reg_sop_sol_det }
) {
  try {
    // Desactiva "Safe Updates" temporalmente
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 0;`);

    // Ejecuta la consulta UPDATE
    const result = await poolmysql.query(
      `
        UPDATE neg_t_soportes 
        SET 
            reg_sop_estado = ?,
            reg_sop_sol_det = ?
        WHERE id = ?
      ;`,
      [reg_sop_estado, reg_sop_sol_det, soporteId]
    );

    // Reactiva "Safe Updates"
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);

    return result;
  } catch (error) {
    console.error("Error actualizando soporte:", error);
    throw error;
  }
}

// QUERY PARA QUE NOC ACEPTE EL SOPORTE
async function aceptarSoporteById(id_sop, { reg_sop_noc_id_acepta }) {
  try {
    // Desactiva "Safe Updates" temporalmente
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 0;`);

    // Ejecuta la consulta UPDATE
    const result = await poolmysql.query(
      `
        UPDATE neg_t_soportes 
        SET 
           
            reg_sop_fecha_acepta = COALESCE(reg_sop_fecha_acepta, NOW()), 
            reg_sop_noc_id_acepta = ?
        WHERE id = ?;
      `,
      [reg_sop_noc_id_acepta, id_sop]
    );

    // Reactiva "Safe Updates"
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);

    return result;
  } catch (error) {
    console.error("Error actualizando soporte:", error);
    throw error;
  }
}

module.exports = {
  selectAllSoportes,
  selectAllSoportesPendientes,
  selectSoporteById,
  selectSoporteByOrdIns,
  updateAsignarSolucion,
  insertSoporte,
  aceptarSoporteById,
  selectSoportesByNoc,
};
