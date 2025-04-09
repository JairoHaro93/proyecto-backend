const { poolmysql } = require("../../config/db");

// QUERY PARA OBTENER LA AGENDA DE UNA FECHA EN ESPECIFICO
async function selectAgendByFecha(fecha) {
  const [agendas] = await poolmysql.query(
    `
   SELECT 
  a.*, 
  s.cli_tel, 
  s.reg_sop_coordenadas,
  s.reg_sop_tec_asignado
FROM 
  neg_t_agenda a
JOIN 
  neg_t_soportes s ON a.age_id_sop = s.id
    WHERE age_fecha = ?
    `,
    [fecha]
  );

  return agendas; // Devuelve directamente el array (aunque esté vacío)
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

// QUERY PARA OBTENER TODOS LOS DATOS AGENDADOS
async function selectAgenda() {
  const [agendas] = await poolmysql.query(
    `
    SELECT * 
    FROM neg_t_agenda 
   
    `
  );

  return agendas; // Devuelve directamente el array (aunque esté vacío)
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

  `,
    [id_tec]
  );

  if (soportes.length === 0) {
    return null; // O podrías devolver un array vacío [] si prefieres.
  }
  return soportes; // DEVOLVER TODOS LOS REGISTROS, NO SOLO EL PRIMERO
}


// QUERY PARA FIJAR FECHA HORA VEHICULO Y TECNICO
async function insertAgenda({
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
async function insertAgendaSop({ age_tipo, age_subtipo,age_ord_ins, age_id_sop,age_observaciones, age_coordenadas }) {
  const [result] = await poolmysql.query(
    `
    INSERT INTO neg_t_agenda (
      age_tipo,
      age_subtipo,
      age_ord_ins,
      age_id_sop,
      age_observaciones,
      age_coordenadas
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [age_tipo,age_subtipo, age_ord_ins, age_id_sop,age_observaciones,age_coordenadas]
  );

  return result.insertId;
}

// QUERY PARA ACTUALIZAR LOS CAMPOS DE HORARIO EN LA AGENDA
async function updateHorario(
  age_id,
  { age_hora_inicio, age_hora_fin, age_fecha , age_vehiculo,age_tecnico }
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
      [age_vehiculo,age_hora_inicio, age_hora_fin, age_fecha, age_tecnico , age_id]
    );

    // Reactiva "Safe Updates"
    await poolmysql.query(`SET SQL_SAFE_UPDATES = 1;`);

    return result;
  } catch (error) {
    console.error("Error actualizando horario:", error);
    throw error;
  }
}

module.exports = {
  selectAgendByFecha,
  selectPreAgenda,
  insertAgenda,
  updateHorario,
  insertAgendaSop,
  selectTrabajosByTec,
};
