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
    Sop.reg_sop_coment_cliente,
    Sop.reg_sop_fecha,
    #Sop.reg_sop_nombre,
    Sop.reg_sop_estado

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
      Sop.reg_sop_coment_cliente,
      Sop.reg_sop_fecha,
      Sop.reg_sop_estado,
      #Sop.reg_sop_nombre,
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

// QUERY: obtener todos los soportes de una fecha determinada (YYYY-MM-DD)
// excluyendo estados 'VISITA' y 'LOS'
async function selectAllSoportesByDate(fecha) {
  const [rows] = await poolmysql.query(
    `
    SELECT 
      Sop.id,
      Sop.ord_ins,
      Sop.reg_sop_opc,
      Sop.reg_sop_tel,

      -- Registrado por
      Sop.reg_sop_registrado_por_id,
      CONCAT(Ureg.nombre, ' ', Ureg.apellido) AS reg_sop_registrado_por_nombre,

      Sop.reg_sop_coment_cliente,
      Sop.reg_sop_fecha,
      Sop.reg_sop_estado,
      Sop.reg_sop_fecha_acepta,
      Sop.reg_sop_sol_det,

      -- Aceptado por (NOC)
      Sop.reg_sop_noc_id_acepta,
      CONCAT(Uacepta.nombre, ' ', Uacepta.apellido) AS reg_sop_aceptado_por_nombre

    FROM neg_t_soportes AS Sop
    -- JOIN 1: usuario que registró
    LEFT JOIN sisusuarios AS Ureg 
      ON Ureg.id = Sop.reg_sop_registrado_por_id
    -- JOIN 2: usuario que aceptó (NOC)
    LEFT JOIN sisusuarios AS Uacepta
      ON Uacepta.id = Sop.reg_sop_noc_id_acepta

    WHERE 
      Sop.reg_sop_fecha >= ? 
      AND Sop.reg_sop_fecha < DATE_ADD(?, INTERVAL 1 DAY)
      AND (Sop.reg_sop_estado IS NULL OR Sop.reg_sop_estado NOT IN ('VISITA','LOS','CULMINADO'))

    ORDER BY Sop.reg_sop_fecha ASC, Sop.id ASC
    `,
    [fecha, fecha]
  );

  return rows; // array (vacío si no hay resultados)
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
        Sop.reg_sop_coment_cliente,
        Sop.reg_sop_fecha,
        Sop.reg_sop_estado,
        #Sop.reg_sop_nombre,
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

// QUERY PARA OBTENER TODOS LOS SOPORTES QUE SE HA REVISADO 1 VEZ
async function selectSoportesRevisados() {
  const [soportes] = await poolmysql.query(
    `
    SELECT 
      Sop.id,
      Sop.ord_ins,
      Sop.reg_sop_opc,
      Sop.reg_sop_tel,

      -- Registrado por
      Sop.reg_sop_registrado_por_id,
      CONCAT(Ureg.nombre, ' ', Ureg.apellido) AS reg_sop_registrado_por_nombre,

      Sop.reg_sop_coment_cliente,
      Sop.reg_sop_fecha,
      Sop.reg_sop_fecha_acepta,
      Sop.reg_sop_estado,

      -- Aceptado por (NOC)
      Sop.reg_sop_noc_id_acepta,
      CONCAT(Uacepta.nombre, ' ', Uacepta.apellido) AS reg_sop_aceptado_por_nombre

    FROM neg_t_soportes AS Sop

    -- JOIN 1: usuario que registró
    LEFT JOIN sisusuarios AS Ureg
      ON Ureg.id = Sop.reg_sop_registrado_por_id

    -- JOIN 2: usuario que aceptó (NOC)
    LEFT JOIN sisusuarios AS Uacepta
      ON Uacepta.id = Sop.reg_sop_noc_id_acepta

    WHERE
    (
        Sop.reg_sop_estado IS NULL
        OR UPPER(TRIM(Sop.reg_sop_estado)) NOT IN ('RESUELTO', 'CULMINADO')
      )
      AND Sop.reg_sop_noc_id_acepta IS NOT NULL
      -- si el campo es VARCHAR y puede venir vacío, mantén este filtro:
      AND TRIM(CAST(Sop.reg_sop_noc_id_acepta AS CHAR)) <> ''

    ORDER BY Sop.reg_sop_fecha DESC, Sop.id DESC
    `
  );

  return soportes;
}

// QUERY PARA CREAR UN SOPORTE NUEVO        --PAGINA REGISTRAR SOPORTE /home/tecnico/registrosop
function insertSoporte({
  ord_ins,
  reg_sop_opc,
  reg_sop_tel,
  reg_sop_registrado_por_id,
  reg_sop_coment_cliente,
  // reg_sop_nombre,
}) {
  return poolmysql.query(
    `INSERT INTO neg_t_soportes (
        ord_ins,
        reg_sop_opc,
        reg_sop_tel,
        reg_sop_registrado_por_id,
        reg_sop_coment_cliente,
        #reg_sop_nombre,
        reg_sop_fecha
      ) VALUES (?, ?, ?, ?, ? , NOW());`, // NOW() insertará la fecha y hora actuales
    [
      ord_ins,
      reg_sop_opc,
      reg_sop_tel,
      reg_sop_registrado_por_id,
      reg_sop_coment_cliente,
      // reg_sop_nombre,
    ]
  );
}

// QUERY PARA ACTUALIZAR LA SOLUCION  --PAGINA INFO-SOP  /home/noc/info-sop/99847
async function updateAsignarSolucion(
  soporteId,
  { reg_sop_estado, reg_sop_sol_det, reg_sop_noc_id_acepta }
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
            reg_sop_sol_det = ?,
            reg_sop_noc_id_acepta = ?
        WHERE id = ?
      ;`,
      [reg_sop_estado, reg_sop_sol_det, reg_sop_noc_id_acepta, soporteId]
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
  selectAllSoportesByDate,
  selectSoporteById,
  selectSoporteByOrdIns,
  updateAsignarSolucion,
  insertSoporte,
  aceptarSoporteById,
  selectSoportesRevisados,
};
