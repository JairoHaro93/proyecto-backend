//src\models\negocio_lat\justificaciones_turno.model.js

const { poolmysql } = require("../../config/db");

async function solicitarJustAtraso(turnoId, motivo) {
  const [res] = await poolmysql.query(
    `UPDATE neg_t_turnos_diarios
     SET just_atraso_estado='PENDIENTE',
         just_atraso_motivo=?,
         just_atraso_jefe_id=NULL,
         just_atraso_minutos=NULL
     WHERE id=?`,
    [motivo, turnoId]
  );
  return res.affectedRows;
}

async function solicitarJustSalida(turnoId, motivo) {
  const [res] = await poolmysql.query(
    `UPDATE neg_t_turnos_diarios
     SET just_salida_estado='PENDIENTE',
         just_salida_motivo=?,
         just_salida_jefe_id=NULL,
         just_salida_minutos=NULL
     WHERE id=?`,
    [motivo, turnoId]
  );
  return res.affectedRows;
}

async function resolverJustAtraso(turnoId, estado, jefeId, minutos) {
  const [res] = await poolmysql.query(
    `UPDATE neg_t_turnos_diarios
     SET just_atraso_estado=?,
         just_atraso_jefe_id=?,
         just_atraso_minutos=?
     WHERE id=? AND just_atraso_estado='PENDIENTE'`,
    [estado, jefeId, minutos ?? null, turnoId]
  );
  return res.affectedRows;
}

async function resolverJustSalida(turnoId, estado, jefeId, minutos) {
  const [res] = await poolmysql.query(
    `UPDATE neg_t_turnos_diarios
     SET just_salida_estado=?,
         just_salida_jefe_id=?,
         just_salida_minutos=?
     WHERE id=? AND just_salida_estado='PENDIENTE'`,
    [estado, jefeId, minutos ?? null, turnoId]
  );
  return res.affectedRows;
}

async function selectPendientesJustificaciones({
  desde,
  hasta,
  usuario_id = null,
}) {
  const params = [desde, hasta];
  let andUsuario = "";
  if (usuario_id) {
    andUsuario = "AND t.usuario_id = ?";
    params.push(usuario_id);
  }

  const [rows] = await poolmysql.query(
    `SELECT
        t.id, t.usuario_id, t.fecha, t.sucursal,
        t.just_atraso_estado, t.just_salida_estado,
        t.just_atraso_motivo, t.just_salida_motivo,
        t.just_atraso_minutos, t.just_salida_minutos
     FROM neg_t_turnos_diarios t
     WHERE t.fecha BETWEEN ? AND ?
       ${andUsuario}
       AND (t.just_atraso_estado='PENDIENTE' OR t.just_salida_estado='PENDIENTE')
     ORDER BY t.fecha ASC, t.usuario_id ASC`,
    params
  );

  return rows;
}

module.exports = {
  solicitarJustAtraso,
  solicitarJustSalida,
  resolverJustAtraso,
  resolverJustSalida,
  selectPendientesJustificaciones,
};
