const { poolmysql } = require("../../config/db");

// QUERY PARA OBTENER LA AGENDA DE UNA FECHA EN ESPECIFICO
async function selectAgendByFecha(fecha) {
  const [agendas] = await poolmysql.query(
    `
    SELECT * 
    FROM neg_t_agenda 
    WHERE age_fecha = ?
    `,
    [fecha]
  );

  return agendas; // Devuelve directamente el array (aunque esté vacío)
}

// QUERY PARA CREAR UN CASO EN LA AGENDA


async function insertAgenda({
  age_nombre,
  age_coordenadas,
  age_hora_inicio,
  age_hora_fin,
  age_fecha,
  age_vehiculo,
  age_tecnico
}) {
  const [result] = await poolmysql.query(
    `
    INSERT INTO neg_t_agenda (
      age_nombre,
      age_coordenadas,
      age_hora_inicio,
      age_hora_fin,
      age_fecha,
      age_vehiculo,
      age_tecnico
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      age_nombre,
      age_coordenadas,
      age_hora_inicio,
      age_hora_fin,
      age_fecha,
      age_vehiculo,
      age_tecnico
    ]
  );

  return result.insertId; // Puedes devolver el ID generado
}


module.exports = { selectAgendByFecha ,insertAgenda};
