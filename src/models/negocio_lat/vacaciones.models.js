// src/models/negocio_lat/vacaciones.models.js
const { poolmysql } = require("../../config/db");

// ---------- CONFIG ----------
async function getConfig() {
  const [rows] = await poolmysql.query(
    `SELECT id, fecha_corte, dias_base, extra_desde_anio, extra_max
     FROM vac_config
     WHERE id = 1
     LIMIT 1`,
  );
  return rows?.[0] || null;
}

// ---------- USUARIOS (BASE) ----------
async function getUsuarioBaseById(usuarioId, conn = poolmysql) {
  const [rows] = await conn.query(
    `
    SELECT
      u.id,
      u.ci,
      u.nombre,
      u.apellido,
      CONCAT(u.nombre, ' ', u.apellido) AS nombre_completo,
      u.cargo,
      DATE_FORMAT(u.fecha_cont, '%Y-%m-%d') AS fecha_cont,

      -- Solo el nombre de la sucursal (ej: COTOPAXI)
      s.nombre AS sucursal_nombre
    FROM sisusuarios u
    LEFT JOIN sis_sucursales s ON s.id = u.sucursal_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [usuarioId],
  );

  return rows?.[0] || null;
}

// ---------- CONSUMO ----------
function toYMD(value) {
  if (!value) return null;

  // Si ya viene "YYYY-MM-DD"
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Si viene Date o string largo tipo "Tue Dec 30 2025..."
  const d = value instanceof Date ? value : new Date(value);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getConsumoInicial({ usuarioId, fechaCorte }) {
  const fecha = toYMD(fechaCorte); // 👈 ESTA es la corrección

  const [rows] = await poolmysql.query(
    `SELECT dias_consumidos
     FROM vac_consumo_inicial
     WHERE usuario_id = ? AND fecha_corte = ?
     LIMIT 1`,
    [usuarioId, fecha],
  );
  return Number(rows?.[0]?.dias_consumidos || 0);
}

async function sumConsumidoAsignacionesActivas({ usuarioId }) {
  const [rows] = await poolmysql.query(
    `SELECT COALESCE(SUM(dias_calendario), 0) AS total
     FROM vac_asignaciones
     WHERE usuario_id = ? AND estado = 'ACTIVA'`,
    [usuarioId],
  );
  return Number(rows?.[0]?.total || 0);
}

// ---------- LISTADO ----------
async function listAsignacionesByUsuario({
  usuarioId,
  estado = "TODAS",
  limit = 50,
  offset = 0,
}) {
  const whereEstado = estado && estado !== "TODAS" ? `AND a.estado = ?` : "";

  const params = [usuarioId];
  if (whereEstado) params.push(estado);
  params.push(Number(limit), Number(offset));

  const [rows] = await poolmysql.query(
    `
    SELECT
      a.*,
      CONCAT(j.nombre,' ',j.apellido) AS jefe_nombre,
      (
        SELECT fl.file_id
        FROM file_links fl
        WHERE fl.module='vacaciones'
          AND fl.entity_id=a.id
          AND fl.tag='acta'
          AND fl.position=1
        LIMIT 1
      ) AS acta_file_id
    FROM vac_asignaciones a
    INNER JOIN sisusuarios j ON j.id = a.jefe_id
    WHERE a.usuario_id = ?
    ${whereEstado}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
    `,
    params,
  );

  return rows || [];
}

// ---------- ASIGNACION (CRUD) ----------
async function insertAsignacion(conn, payload) {
  const [res] = await conn.query(
    `
    INSERT INTO vac_asignaciones (
      usuario_id, jefe_id,
      fecha_desde, fecha_hasta,
      dias_calendario, estado, observacion,

      generados_al_momento,
      consumido_antes,
      saldo_real_antes,
      saldo_real_despues,
      saldo_visible_antes,
      saldo_visible_despues,

      sol_anio,
      sol_consecutivo,
      sol_numero
    ) VALUES (
      ?, ?,
      ?, ?,
      ?, 'ACTIVA', ?,

      ?, ?, ?, ?, ?, ?,

      ?, ?, ?
    )
    `,
    [
      payload.usuario_id,
      payload.jefe_id,
      payload.fecha_desde,
      payload.fecha_hasta,
      payload.dias_calendario,
      payload.observacion || null,

      payload.generados_al_momento,
      payload.consumido_antes,
      payload.saldo_real_antes,
      payload.saldo_real_despues,
      payload.saldo_visible_antes,
      payload.saldo_visible_despues,

      payload.sol_anio,
      payload.sol_consecutivo,
      payload.sol_numero,
    ],
  );
  return res.insertId;
}

async function getAsignacionById(id) {
  const [rows] = await poolmysql.query(
    `SELECT * FROM vac_asignaciones WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows?.[0] || null;
}

async function marcarAsignacionAnulada(conn, { id, anulada_por, motivo }) {
  await conn.query(
    `
    UPDATE vac_asignaciones
    SET
      estado='ANULADA',
      anulada_at=NOW(),
      anulada_por=?,
      observacion = CONCAT(COALESCE(observacion,''), IF(COALESCE(observacion,'')='', '', ' | '), 'ANULADA: ', ?)
    WHERE id = ? AND estado='ACTIVA'
    `,
    [anulada_por, motivo || "sin motivo", id],
  );
}

async function getBackupsByVacacion(conn, vacacionId) {
  const [rows] = await conn.query(
    `
    SELECT *
    FROM vac_turno_backup
    WHERE vacacion_id = ?
    ORDER BY fecha ASC
    `,
    [vacacionId],
  );
  return rows || [];
}

async function insertBackupsBatch(conn, backups = []) {
  if (!backups.length) return;
  const values = backups.map((b) => [
    b.vacacion_id,
    b.usuario_id,
    b.fecha,
    b.turno_id,
    b.turno_existia,
    b.tipo_dia_anterior,
  ]);
  await conn.query(
    `
    INSERT INTO vac_turno_backup
      (vacacion_id, usuario_id, fecha, turno_id, turno_existia, tipo_dia_anterior)
    VALUES ?
    `,
    [values],
  );
}

// ---------- TURNOS ----------
async function selectTurnosEnRango(conn, { usuarioId, desde, hasta }) {
  const [rows] = await conn.query(
    `
    SELECT id, usuario_id, fecha, tipo_dia,
      hora_entrada_prog, hora_salida_prog,
      hora_entrada_1, hora_salida_1, hora_entrada_2, hora_salida_2,
      hora_entrada_real, hora_salida_real,
      estado_asistencia, observacion
    FROM neg_t_turnos_diarios
    WHERE usuario_id = ?
      AND fecha BETWEEN ? AND ?
    `,
    [usuarioId, desde, hasta],
  );
  return rows || [];
}

async function selectConflictosEnRango(conn, { usuarioId, desde, hasta }) {
  const [rows] = await conn.query(
    `
    SELECT fecha, tipo_dia
    FROM neg_t_turnos_diarios
    WHERE usuario_id = ?
      AND fecha BETWEEN ? AND ?
      AND tipo_dia IN ('PERMISO','DEVOLUCION','VACACIONES')
    ORDER BY fecha ASC
    `,
    [usuarioId, desde, hasta],
  );
  return rows || [];
}

async function updateTurnoTipoDia(conn, { turnoId, tipoDia }) {
  await conn.query(
    `UPDATE neg_t_turnos_diarios SET tipo_dia = ? WHERE id = ?`,
    [tipoDia, turnoId],
  );
}

async function inferSucursalUsuario(conn, usuarioId, fecha) {
  const [rows] = await conn.query(
    `
    SELECT sucursal
    FROM neg_t_turnos_diarios
    WHERE usuario_id = ?
      AND sucursal IS NOT NULL AND sucursal <> ''
      AND fecha <= ?
    ORDER BY fecha DESC
    LIMIT 1
    `,
    [usuarioId, fecha],
  );
  return rows?.[0]?.sucursal || null;
}

async function insertTurnoVacacion(
  conn,
  { usuarioId, fecha, sucursal = null },
) {
  if (!sucursal) {
    sucursal = await inferSucursalUsuario(conn, usuarioId, fecha);
  }

  const [res] = await conn.query(
    `
    INSERT INTO neg_t_turnos_diarios (
      usuario_id, fecha, sucursal,
      hora_entrada_prog, hora_salida_prog,
      min_toler_atraso, min_toler_salida,
      estado_asistencia,
      tipo_dia
    )
    VALUES (
      ?, ?, ?,
      '00:00:00', '00:00:00',
      0, 0,
      'SIN_MARCA',
      'VACACIONES'
    )
    `,
    [usuarioId, fecha, sucursal],
  );

  return res.insertId;
}

async function getTurnoById(conn, turnoId) {
  const [rows] = await conn.query(
    `
    SELECT id, usuario_id, fecha, tipo_dia,
      hora_entrada_prog, hora_salida_prog,
      hora_entrada_1, hora_salida_1, hora_entrada_2, hora_salida_2,
      hora_entrada_real, hora_salida_real,
      estado_asistencia, observacion
    FROM neg_t_turnos_diarios
    WHERE id = ?
    LIMIT 1
    `,
    [turnoId],
  );
  return rows?.[0] || null;
}

async function deleteTurnoById(conn, turnoId) {
  await conn.query(`DELETE FROM neg_t_turnos_diarios WHERE id = ?`, [turnoId]);
}

// ---------- FILES / LINKS ----------
async function insertFile(conn, { ruta_relativa, mimetype, size, created_by }) {
  const [res] = await conn.query(
    `
    INSERT INTO files (ruta_relativa, mimetype, size, created_by)
    VALUES (?, ?, ?, ?)
    `,
    [ruta_relativa, mimetype, size, created_by || null],
  );
  return res.insertId;
}

async function insertFileLink(
  conn,
  { module, entity_id, tag, position, file_id, created_by },
) {
  const [res] = await conn.query(
    `
    INSERT INTO file_links (module, entity_id, tag, position, file_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [module, entity_id, tag, position || 1, file_id, created_by || null],
  );
  return res.insertId;
}

async function getActaFileIdByAsignacion(asignacionId) {
  const [rows] = await poolmysql.query(
    `
    SELECT file_id
    FROM file_links
    WHERE module='vacaciones'
      AND entity_id=?
      AND tag='acta'
      AND position=1
    LIMIT 1
    `,
    [asignacionId],
  );
  return rows?.[0]?.file_id || null;
}

async function getSucursalRecienteFromTurnos(conn, usuarioId) {
  const [rows] = await conn.query(
    `
    SELECT sucursal
    FROM neg_t_turnos_diarios
    WHERE usuario_id = ?
      AND sucursal IS NOT NULL
      AND sucursal <> ''
    ORDER BY fecha DESC
    LIMIT 1
    `,
    [usuarioId],
  );

  return rows?.[0]?.sucursal || null;
}

// Consecutivo por usuario + año (1..N)
async function nextSolicitudConsecutivo(conn, usuarioId, anio) {
  const [rows] = await conn.query(
    `
    SELECT last_consecutivo
    FROM vac_solicitud_seq
    WHERE usuario_id = ? AND anio = ?
    FOR UPDATE
    `,
    [usuarioId, anio],
  );

  if (rows.length) {
    const next = Number(rows[0].last_consecutivo || 0) + 1;

    await conn.query(
      `
      UPDATE vac_solicitud_seq
      SET last_consecutivo = ?
      WHERE usuario_id = ? AND anio = ?
      `,
      [next, usuarioId, anio],
    );

    return next;
  }

  await conn.query(
    `
    INSERT INTO vac_solicitud_seq (usuario_id, anio, last_consecutivo)
    VALUES (?, ?, 1)
    `,
    [usuarioId, anio],
  );

  return 1;
}

// ===============================
//   SALDO SIMPLE (solo días disponibles)
// ===============================

function parseECDate(ymd) {
  // fija -05:00 para evitar corrimientos
  return new Date(`${ymd}T00:00:00-05:00`);
}

function format2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

function addYears(dateObj, years) {
  const d = new Date(dateObj.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function minDate(a, b) {
  return a.getTime() <= b.getTime() ? a : b;
}

function calcGenerados({ fechaContYMD, hastaDate, config }) {
  const base = Number(config?.dias_base || 15);
  const extraDesde = Number(config?.extra_desde_anio || 6); // 6 => extra a partir del año 6
  const extraMax = Number(config?.extra_max || 15);

  const start = parseECDate(fechaContYMD);
  const end = hastaDate;

  if (end.getTime() <= start.getTime()) return 0;

  let total = 0;
  let yearNum = 1;
  let cursor = new Date(start.getTime());

  while (cursor.getTime() < end.getTime()) {
    const nextAnniv = addYears(start, yearNum);
    const segEnd = minDate(nextAnniv, end);

    const segDays = Math.max(
      0,
      Math.floor((segEnd.getTime() - cursor.getTime()) / (24 * 3600 * 1000)),
    );

    let extra = 0;
    if (yearNum >= extraDesde) {
      extra = yearNum - (extraDesde - 1);
      if (extra > extraMax) extra = extraMax;
    }
    const entitlement = base + extra;

    const yearStart = addYears(start, yearNum - 1);
    const yearEnd = addYears(start, yearNum);
    const yearLenDays = Math.max(
      1,
      Math.floor(
        (yearEnd.getTime() - yearStart.getTime()) / (24 * 3600 * 1000),
      ),
    );

    total += (entitlement * segDays) / yearLenDays;

    cursor = segEnd;
    yearNum += 1;
  }

  return total;
}

/**
 * ✅ Devuelve SOLO saldo visible (días disponibles)
 */
async function getVacacionesDisponiblesDias(usuarioId, refDate = new Date()) {
  const config = await getConfig();
  if (!config) throw new Error("vac_config no configurado");

  const user = await getUsuarioBaseById(usuarioId);
  if (!user) return 0;

  const generados = calcGenerados({
    fechaContYMD: user.fecha_cont,
    hastaDate: refDate,
    config,
  });

  const consumidoInicial = await getConsumoInicial({
    usuarioId,
    fechaCorte: config.fecha_corte,
  });

  const consumidoAsign = await sumConsumidoAsignacionesActivas({ usuarioId });

  const consumidoTotal = consumidoInicial + consumidoAsign;
  const saldoReal = generados - consumidoTotal;
  const saldoVisible = Math.max(0, saldoReal);

  return format2(saldoVisible);
}

module.exports = {
  getConfig,
  getUsuarioBaseById,

  getConsumoInicial,
  sumConsumidoAsignacionesActivas,
  getVacacionesDisponiblesDias,

  listAsignacionesByUsuario,

  insertAsignacion,
  getAsignacionById,
  marcarAsignacionAnulada,

  getBackupsByVacacion,
  insertBackupsBatch,

  selectTurnosEnRango,
  selectConflictosEnRango,
  updateTurnoTipoDia,
  insertTurnoVacacion,
  getTurnoById,
  deleteTurnoById,

  insertFile,
  insertFileLink,
  getActaFileIdByAsignacion,

  getSucursalRecienteFromTurnos,
  nextSolicitudConsecutivo,
};
