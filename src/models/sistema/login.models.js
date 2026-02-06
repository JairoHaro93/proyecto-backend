// src/models/sistema/login.models.js
const { poolmysql } = require("../../config/db");

function normalizeUsuarioRow(u) {
  if (!u) return null;

  // funciones puede venir como string JSON o como array
  let funciones = u.funciones ?? [];
  if (typeof funciones === "string") {
    try {
      funciones = JSON.parse(funciones);
    } catch {
      funciones = [];
    }
  }
  if (!Array.isArray(funciones)) funciones = [];

  // limpia nulls + normaliza + elimina duplicados por nombre (mantiene max finger)
  const map = new Map();
  for (const f of funciones) {
    if (!f?.nombre) continue;
    const nombre = String(f.nombre).trim();
    if (!nombre) continue;
    const finger = Number(f.is_finger_auth || 0);
    map.set(nombre, Math.max(map.get(nombre) || 0, finger));
  }
  const funcionesNorm = Array.from(map, ([nombre, is_finger_auth]) => ({
    nombre,
    is_finger_auth,
  }));

  // rol visible según estado global del usuario
  const fingerOk = Number(u.is_auth_finger) === 1 || u.is_auth_finger === true;

  u.funciones = funcionesNorm;
  u.rol = funcionesNorm
    .filter((f) => fingerOk || Number(f.is_finger_auth) === 0)
    .map((f) => f.nombre);

  return u;
}

async function selectByUsuario(usuario) {
  const [rows] = await poolmysql.query(
    `
    SELECT 
      U.id,
      U.nombre,
      U.apellido,
      U.ci,
      U.usuario,
      U.password,
      U.fecha_nac,
      U.fecha_cont,
      U.genero,
      U.is_auth,
      U.is_auth_finger,
      U.is_logged,
      U.is_auth_app,
      U.is_logged_app,

      U.sucursal_id,
      S.codigo  AS sucursal_codigo,
      S.nombre  AS sucursal_nombre,

      U.departamento_id,
      D.codigo  AS departamento_codigo,
      D.nombre  AS departamento_nombre,

      JSON_ARRAYAGG(
        JSON_OBJECT(
          'nombre', F.nombre,
          'is_finger_auth', COALESCE(UHF.is_finger_auth, 0)
        )
      ) AS funciones

    FROM sisusuarios AS U
    LEFT JOIN sis_sucursales   AS S  ON S.id  = U.sucursal_id
    LEFT JOIN sis_departamentos AS D ON D.id = U.departamento_id
    LEFT JOIN sisusuarios_has_sisfunciones AS UHF 
      ON UHF.sisusuarios_id = U.id
    LEFT JOIN sisfunciones AS F 
      ON UHF.sisfunciones_id = F.id
    WHERE U.usuario = ?
    GROUP BY U.id
    `,
    [usuario],
  );

  if (!rows || rows.length === 0) return null;
  return normalizeUsuarioRow(rows[0]);
}

async function selectByid(id) {
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
      U.is_logged,
      U.is_auth_app,
      U.is_logged_app,

      U.sucursal_id,
      S.codigo  AS sucursal_codigo,
      S.nombre  AS sucursal_nombre,

      U.departamento_id,
      D.codigo  AS departamento_codigo,
      D.nombre  AS departamento_nombre,

      JSON_ARRAYAGG(
        JSON_OBJECT(
          'nombre', F.nombre,
          'is_finger_auth', COALESCE(UHF.is_finger_auth, 0)
        )
      ) AS funciones

    FROM sisusuarios AS U
    LEFT JOIN sis_sucursales   AS S  ON S.id  = U.sucursal_id
    LEFT JOIN sis_departamentos AS D ON D.id = U.departamento_id
    LEFT JOIN sisusuarios_has_sisfunciones AS UHF 
      ON UHF.sisusuarios_id = U.id
    LEFT JOIN sisfunciones AS F 
      ON UHF.sisfunciones_id = F.id
    WHERE U.id = ?
    GROUP BY U.id
    `,
    [id],
  );

  if (!rows || rows.length === 0) return null;
  return normalizeUsuarioRow(rows[0]);
}

module.exports = { selectByUsuario, selectByid };
