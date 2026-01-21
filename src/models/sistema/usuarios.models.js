const { poolmysql } = require("../../config/db");

// OBTENER TODOS LOS USUARIOS
function selectAllUsuarios() {
  return poolmysql.query(`
    SELECT * FROM sisusuarios`);
}

// OBTENER USUARIO POR ID
// usuarios.models.js
// src/models/sistema/usuarios.models.js
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

      U.sucursal_id,
      S.codigo  AS sucursal_codigo,
      S.nombre  AS sucursal_nombre,

      U.departamento_id,
      D.codigo  AS departamento_codigo,
      D.nombre  AS departamento_nombre,

      -- 🔹 JSON con nombres de funciones/roles (SIN ORDER BY)
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
    [id]
  );

  if (!rows || rows.length === 0) return null;

  const usuario = rows[0];

  // MySQL devuelve JSON_ARRAYAGG como string → lo parseamos
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

  console.log(
    "[USUARIOS] selectUsuarioById →",
    JSON.stringify(usuario, null, 2)
  );

  return usuario;
}
// OBTENER TODOS LOS USUARIOS CON AGENDA-TECNICOS
async function selectAllAgendaTecnicos() {
  const query = `
    SELECT u.id, u.nombre, u.apellido
    FROM sisusuarios_has_sisfunciones uhf
    JOIN sisusuarios u ON uhf.sisusuarios_id = u.id
    WHERE uhf.sisfunciones_id = 7;
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
    ` INSERT INTO sisusuarios (
  
    nombre,
    apellido,
    ci,
    usuario,
    password,
    fecha_nac,
    fecha_cont,
    genero
 
) VALUES (
  
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   ?,
   ?
);`,
    [nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero]
  );
}

// ACTUALIZAR USUARIOS
async function updateUsuarioById(
  usuarioId,
  { nombre, apellido, ci, usuario, password, fecha_nac, fecha_cont, genero }
) {
  return poolmysql.query(
    `
    UPDATE sisusuarios SET 
    nombre = ? ,
    apellido = ?,
    ci = ?,
    usuario = ?,
    password = ?,
    fecha_nac = ?, 
    fecha_cont = ?, 
    genero = ?
    WHERE id=?
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
    ]
  );
}

//BORRAR USUARIO
async function deleteUsuario(usuarioId) {
  return poolmysql.query(`DELETE FROM  sisusuarios WHERE id = ?`, [usuarioId]);
}

// Actualiza el flag is_auth de un usuario (0 = fuera, 1 = dentro)
function updateUsuarioAuthFlag(usuario_id, is_auth) {
  const sql = `
    UPDATE sisusuarios
    SET is_auth = ?
    WHERE id = ?
  `;
  const params = [is_auth, usuario_id];
  return poolmysql.query(sql, params);
}

// models/sistema/usuarios.models.js
/**
 * Devuelve los usuarios sobre los que el jefe puede gestionar turnos.
 *
 * Reglas:
 *  - Siempre se filtra por la sucursal del jefe (sucursalId).
 *  - Si NO tiene departamento_id  => se asume JEFE DE SUCURSAL:
 *        → devuelve sólo los jefes de departamento de esa sucursal
 *          (usuarios que están en sis_departamentos.jefe_usuario_id).
 *  - Si SÍ tiene departamento_id => JEFE DE DEPARTAMENTO (o area):
 *        → devuelve todos los usuarios cuyo departamento esté en el
 *          subárbol de ese departamento (padre + hijos + nietos...).
 *  - Siempre se EXCLUYE al propio jefe (excluirUsuarioId).
 */
async function selectUsuariosParaTurnos({
  sucursalId,
  departamentoId,
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
  } else if (departamentoId) {
    sql += " AND D.parent_id = ?";
    params.push(departamentoId);
  } else {
    sql += " AND D.sucursal_id = ? AND D.parent_id IS NULL";
    params.push(sucursalId);
    sql += " AND D.jefe_usuario_id = U.id";
  }

  sql += " ORDER BY D.id ASC, U.nombre ASC, U.apellido ASC";

  const [rows] = await poolmysql.query(sql, params);
  return rows;
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
};
