// src/models/sistema/login.models.js
const { poolmysql } = require("../../config/db");

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
      U.is_logged,
      U.is_auth_app,
      U.is_logged_app,

      -- 🔹 Sucursal (FK en sisusuarios)
      U.sucursal_id,
      S.codigo  AS sucursal_codigo,
      S.nombre  AS sucursal_nombre,

      -- 🔹 Departamento (FK en sisusuarios)
      U.departamento_id,
      D.codigo  AS departamento_codigo,
      D.nombre  AS departamento_nombre,

      JSON_ARRAYAGG(F.nombre) AS rol
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
    [usuario]
  );

  if (!rows || rows.length === 0) return null;
  return rows[0];
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

      U.sucursal_id,
      S.codigo  AS sucursal_codigo,
      S.nombre  AS sucursal_nombre,

      U.departamento_id,
      D.codigo  AS departamento_codigo,
      D.nombre  AS departamento_nombre,

      JSON_ARRAYAGG(F.nombre) AS rol
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
    [id]
  );

  if (!rows || rows.length === 0) return null;
  return rows[0];
}

module.exports = { selectByUsuario, selectByid };
