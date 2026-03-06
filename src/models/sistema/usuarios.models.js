const { poolmysql } = require("../../config/db");

// OBTENER TODOS LOS USUARIOS
function selectAllUsuarios() {
  return poolmysql.query(`
    SELECT * FROM sisusuarios
  `);
}

// OBTENER USUARIO POR ID
async function selectUsuarioById(id) {
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
      U.is_auth,
      U.is_auth_finger,
      U.sucursal_id,
      S.codigo  AS sucursal_codigo,
      S.nombre  AS sucursal_nombre,

      U.departamento_id,
      D.codigo  AS departamento_codigo,
      D.nombre  AS departamento_nombre,

      COALESCE(
        (
          SELECT JSON_ARRAYAGG(F.nombre)
          FROM sisusuarios_has_sisfunciones UF
          JOIN sisfunciones F 
            ON F.id = UF.sisfunciones_id
          WHERE UF.sisusuarios_id = U.id
        ),
        JSON_ARRAY()
      ) AS rol
    FROM sisusuarios AS U
    LEFT JOIN sis_sucursales    AS S ON S.id = U.sucursal_id
    LEFT JOIN sis_departamentos AS D ON D.id = U.departamento_id
    WHERE U.id = ?
    `,
    [id],
  );

  if (!rows || rows.length === 0) return null;

  const usuario = rows[0];

  if (usuario.rol && typeof usuario.rol === "string") {
    try {
      usuario.rol = JSON.parse(usuario.rol);
    } catch (e) {
      console.error("❌ Error parseando JSON de rol:", e, usuario.rol);
      usuario.rol = [];
    }
  } else if (!Array.isArray(usuario.rol)) {
    usuario.rol = [];
  }

  return usuario;
}

// OBTENER TODOS LOS USUARIOS CON AGENDA-TECNICOS
async function selectAllAgendaTecnicos() {
  const query = `
    SELECT u.id, u.nombre, u.apellido
    FROM sisusuarios_has_sisfunciones uhf
    JOIN sisusuarios u ON uhf.sisusuarios_id = u.id
    WHERE uhf.sisfunciones_id = 7
  `;
  return poolmysql
    .query(query)
    .then(([rows]) => rows)
    .catch((error) => {
      console.error("Error en la consulta SQL:", error);
      throw error;
    });
}

// CREAR USUARIO
async function insertUsuario({
  nombre,
  apellido,
  ci,
  usuario,
  password,
  fecha_nac,
  fecha_cont,
  genero,
}) {
  return poolmysql.query(
    `
    INSERT INTO sisusuarios (
      nombre,
      apellido,
      ci,
      usuario,
      password,
      fecha_nac,
      fecha_cont,
      genero
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero],
  );
}

// ACTUALIZAR USUARIOS
async function updateUsuarioById(
  usuarioId,
  { nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero },
) {
  return poolmysql.query(
    `
    UPDATE sisusuarios SET 
      nombre = ?,
      apellido = ?,
      ci = ?,
      usuario = ?,
      password = ?,
      fecha_nac = ?, 
      fecha_cont = ?, 
      genero = ?
    WHERE id = ?
    `,
    [
      nombre,
      apellido,
      ci,
      usuario,
      password,
      fecha_nac,
      fecha_cont,
      genero,
      usuarioId,
    ],
  );
}

// BORRAR USUARIO
async function deleteUsuario(usuarioId) {
  return poolmysql.query(`DELETE FROM sisusuarios WHERE id = ?`, [usuarioId]);
}

// Actualiza el flag is_auth_finger de un usuario
async function updateUsuarioAuthFlag(usuario_id, is_auth_finger) {
  const [result] = await poolmysql.query(
    `UPDATE sisusuarios SET is_auth_finger = ? WHERE id = ?`,
    [Number(is_auth_finger), Number(usuario_id)],
  );
  return result;
}

/**
 * Usuarios que se pueden gestionar en turnos,
 * filtrados por un departamento concreto permitido.
 */
async function selectUsuariosParaTurnos({
  sucursalId,
  jefeUsuarioId,
  departamentoFiltro,
}) {
  const params = [];
  let sql = `
    SELECT DISTINCT
      U.id,
      U.nombre,
      U.apellido,
      U.ci,
      U.usuario,
      U.sucursal_id,
      S.codigo  AS sucursal_codigo,
      S.nombre  AS sucursal_nombre,
      U.departamento_id,
      D.codigo  AS departamento_codigo,
      D.nombre  AS departamento_nombre,
      D.id      AS departamento_real_id,
      D.parent_id,

      COALESCE(HM.saldo_minutos, 0) AS saldo_minutos

    FROM sisusuarios AS U
    LEFT JOIN sis_sucursales    AS S ON S.id = U.sucursal_id
    LEFT JOIN sis_departamentos AS D ON D.id = U.departamento_id

    LEFT JOIN (
      SELECT
        usuario_id,
        COALESCE(SUM(
          CASE
            WHEN estado <> 'APROBADO' THEN 0

            WHEN mov_tipo = 'CREDITO'
             AND mov_concepto = 'HORA_ACUMULADA'
            THEN minutos

            WHEN mov_tipo = 'DEBITO'
             AND mov_concepto IN ('JUST_ATRASO','JUST_SALIDA','DEVOLUCION')
            THEN -minutos

            ELSE 0
          END
        ), 0) AS saldo_minutos
      FROM neg_t_horas_movimientos
      GROUP BY usuario_id
    ) HM ON HM.usuario_id = U.id

    WHERE 1 = 1 
    AND U.estado = 'ACTIVO'
  `;

  if (sucursalId) {
    sql += " AND U.sucursal_id = ?";
    params.push(sucursalId);
  }

  if (jefeUsuarioId) {
    sql += " AND U.id <> ?";
    params.push(jefeUsuarioId);
  }

  if (departamentoFiltro) {
    sql += " AND U.departamento_id = ?";
    params.push(departamentoFiltro);
  } else {
    sql += " AND 1 = 0";
  }

  sql += " ORDER BY D.nombre ASC, U.nombre ASC, U.apellido ASC";

  const [rows] = await poolmysql.query(sql, params);
  return rows;
}

// ciudades cobertura por sucursal
async function selectCiudadesBySucursal(sucursalId) {
  const [rows] = await poolmysql.query(
    `
    SELECT ciudad
    FROM sis_ciudades_cobertura
    WHERE sucursal_id = ? AND estado = 'ACTIVA'
    ORDER BY ciudad ASC
    `,
    [sucursalId],
  );
  return rows;
}

/**
 * Departamentos que el usuario autenticado puede controlar en turnos.
 *
 * Reglas:
 *  - Jefe de sucursal: sucursal_id sí, departamento_id no
 *      => ve todos los departamentos activos de su sucursal.
 *
 *  - Jefe/responsable de departamentos
 *      => ve departamentos donde jefe_usuario_id = usuarioId.
 *
 *  - Sin coincidencias
 *      => devuelve [].
 */
async function selectDepartamentosControladosPorUsuario({
  usuarioId,
  sucursalId,
  departamentoId,
}) {
  // Caso 1: jefe de sucursal
  if (sucursalId && !departamentoId) {
    const [rows] = await poolmysql.query(
      `
      SELECT
        d.id,
        d.parent_id,
        d.nivel,
        d.sucursal_id,
        d.codigo,
        d.nombre,
        d.estado,
        d.jefe_usuario_id
      FROM sis_departamentos d
      WHERE d.sucursal_id = ?
        AND d.estado = 'ACTIVO'
      ORDER BY d.nivel ASC, d.nombre ASC
      `,
      [sucursalId],
    );
    return rows;
  }

  // Caso 2: jefe/responsable de uno o varios departamentos
  const [rowsJefe] = await poolmysql.query(
    `
    SELECT
      d.id,
      d.parent_id,
      d.nivel,
      d.sucursal_id,
      d.codigo,
      d.nombre,
      d.estado,
      d.jefe_usuario_id
    FROM sis_departamentos d
    WHERE d.jefe_usuario_id = ?
      AND d.estado = 'ACTIVO'
    ORDER BY d.nivel ASC, d.nombre ASC
    `,
    [usuarioId],
  );

  return rowsJefe;
}

module.exports = {
  selectAllUsuarios,
  selectUsuarioById,
  selectAllAgendaTecnicos,
  insertUsuario,
  updateUsuarioById,
  deleteUsuario,
  updateUsuarioAuthFlag,
  selectUsuariosParaTurnos,
  selectCiudadesBySucursal,
  selectDepartamentosControladosPorUsuario,
};
