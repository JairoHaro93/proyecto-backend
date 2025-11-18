const { poolmysql } = require("../../config/db");

// QUERY: obtener agenda de una fecha específica (YYYY-MM-DD) + nombre del técnico
async function selectAgendByFecha(fecha) {
  const [agendas] = await poolmysql.query(
    `
    SELECT
      a.id,
      a.age_tipo,
      a.ord_ins,
      a.age_id_tipo,
      a.age_id_sop,
      a.age_coordenadas,
      a.age_hora_inicio,
      a.age_hora_fin,
      a.age_fecha,
      a.age_vehiculo,
      a.age_tecnico,
      a.age_diagnostico,
      a.age_telefono,
      a.age_solucion,
      a.age_estado,
      -- Nombre del técnico
      CONCAT(Utec.nombre, ' ', Utec.apellido) AS nombre_completo
    FROM neg_t_agenda AS a
    LEFT JOIN sisusuarios AS Utec
      ON Utec.id = CAST(a.age_tecnico AS UNSIGNED)  -- si age_tecnico es VARCHAR, castear ayuda
    WHERE
      a.age_fecha >= ?
      AND a.age_fecha < DATE_ADD(?, INTERVAL 1 DAY)
    ORDER BY a.age_hora_inicio ASC, a.id ASC
    `,
    [fecha, fecha]
  );

  return agendas; // array (vacío si no hay resultados)
}

// QUERY PARA OBTENER TODOS LOS DATOS PREAGENDA
async function selectPreAgenda() {
  const [preagendas] = await poolmysql.query(
    `

SELECT 
  a.*

FROM 
  neg_t_agenda a

WHERE 
  a.age_fecha IS NULL;


    `
  );

  return preagendas; // Devuelve directamente el array (aunque esté vacío)
}

// QUERY PARA OBTENER UNA AGENDA POR ORDINS
async function selectAgendaByOrdIns(ord_ins) {
  const [agendas] = await poolmysql.query(
    `
    SELECT 
            *
    FROM
        neg_t_agenda AS Age
    WHERE  
        Age.ord_ins = ?
  
    `,
    [ord_ins]
  );

  return agendas;
}

async function selectAgendaBySopId(age_id_sop) {
  const [agendas] = await poolmysql.query(
    `
    SELECT *
    FROM neg_t_agenda
    WHERE age_id_sop = ?
    `,
    [age_id_sop]
  );
  return agendas;
}

// QUERY PARA OBTENER TODOS LOS TRABAJOS AGENDADOS PENDIENTES
async function selectAgendaPendByFecha(fecha) {
  const [pendientes] = await poolmysql.query(
    `
SELECT COUNT(*) AS soportes_pendientes
FROM neg_t_agenda
WHERE age_fecha = ?
  AND age_estado = 'PENDIENTE';

    `,
    [fecha]
  );

  return pendientes[0];
}

// QUERY PARA OBTENER TODOS LOS TRABAJOS ASIGNADOS AL TECNICO
async function selectTrabajosByTec(id_tec) {
  const [soportes] = await poolmysql.query(
    `
 SELECT 
  *
FROM 
  neg_t_agenda 
    WHERE age_tecnico = ?
    AND age_estado <> 'CONCLUIDO'

  `,
    [id_tec]
  );

  if (soportes.length === 0) {
    return null; // O podrías devolver un array vacío [] si prefieres.
  }
  return soportes; // DEVOLVER TODOS LOS REGISTROS, NO SOLO EL PRIMERO
}

// QUERY PARA OBTENER LA INFORMACION DE LA SOLUCION DEL TRABAJO AGENDADO
async function selectInfoSolByAgeId(age_id) {
  const [solucion] = await poolmysql.query(
    `
 SELECT 
  age_solucion
FROM 
  neg_t_agenda 
    WHERE id = ?

  `,
    [age_id]
  );

  return solucion;
}

// QUERY PARA FIJAR FECHA HORA VEHICULO Y TECNICO
async function insertAgendaHorario({
  age_hora_inicio,
  age_hora_fin,
  age_fecha,
  age_vehiculo,
  age_tecnico,
}) {
  const [result] = await poolmysql.query(
    `
    INSERT INTO neg_t_agenda (
      age_hora_inicio,
      age_hora_fin,
      age_fecha,
      age_vehiculo,
      age_tecnico
    ) VALUES (  ?, ?, ?, ?, ?)
    `,
    [age_hora_inicio, age_hora_fin, age_fecha, age_vehiculo, age_tecnico]
  );

  return result.insertId; // Puedes devolver el ID generado
}

// QUERY PARA CREAR UN CASO EN LA AGENDA
async function insertAgendaSop({
  age_tipo,
  ord_ins,
  age_id_tipo,
  age_id_sop,
  age_diagnostico,
  age_coordenadas,
  age_telefono,
}) {
  const [result] = await poolmysql.query(
    `
    INSERT INTO neg_t_agenda (
      age_estado,
      age_tipo,
      ord_ins,
      age_id_tipo,
      age_id_sop,
      age_diagnostico,
      age_coordenadas,
      age_telefono
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      "PENDIENTE", // valor para age_estado
      age_tipo,
      ord_ins,
      age_id_tipo,
      age_id_sop,
      age_diagnostico,
      age_coordenadas,
      age_telefono,
    ]
  );

  return result.insertId;
}

// QUERY PARA ACTUALIZAR LOS CAMPOS DE HORARIO EN LA AGENDA
async function updateHorario(
  age_id,
  { age_hora_inicio, age_hora_fin, age_fecha, age_vehiculo, age_tecnico }
) {
  try {
    // Desactiva "Safe Updates" temporalmente
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 0;`);

    // Ejecuta la consulta UPDATE en la tabla correcta
    const [result] = await poolmysql.query(
      `
      UPDATE neg_t_agenda 
      SET 
        age_vehiculo = ?,
        age_hora_inicio = ?,
        age_hora_fin = ?,
        age_fecha = ?,
        age_tecnico =?
      WHERE id = ?
      `,
      [
        age_vehiculo,
        age_hora_inicio,
        age_hora_fin,
        age_fecha,
        age_tecnico,
        age_id,
      ]
    );

    // Reactiva "Safe Updates"
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);

    return result;
  } catch (error) {
    console.error("Error actualizando horario:", error);
    throw error;
  }
}

// QUERY PARA ACTUALIZAR LOS CAMPOS DE HORARIO EN LA AGENDA
async function updateSolucion(age_id, { age_estado, age_solucion }) {
  try {
    // Desactiva "Safe Updates" temporalmente
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 0;`);

    // Ejecuta la consulta UPDATE en la tabla correcta
    const [result] = await poolmysql.query(
      `
      UPDATE neg_t_agenda 
      SET 
        age_estado = ?,
        age_solucion = ?
      WHERE id = ?
      `,
      [age_estado, age_solucion, age_id]
    );

    // Reactiva "Safe Updates"
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);

    return result;
  } catch (error) {
    console.error("Error actualizando la solucion:", error);
    throw error;
  }
}

/**
 * Devuelve datos mínimos de la agenda (para lógica post-actualización)
 */
async function selectAgendaLiteById(age_id) {
  const [rows] = await poolmysql.query(
    `
    SELECT 
      id,
      age_tipo,
      age_id_sop,
      ord_ins,
      age_estado
    FROM neg_t_agenda
    WHERE id = ?
    LIMIT 1
    `,
    [age_id]
  );
  return rows[0] || null;
}

module.exports = {
  selectAgendByFecha,
  selectPreAgenda,
  selectAgendaByOrdIns,
  selectAgendaBySopId,
  insertAgendaHorario,
  updateHorario,
  updateSolucion,
  insertAgendaSop,
  selectTrabajosByTec,
  selectInfoSolByAgeId,
  selectAgendaPendByFecha,
  selectAgendaLiteById,
};
