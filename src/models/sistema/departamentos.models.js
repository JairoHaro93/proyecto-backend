// src/models/sistema/departamentos.models.js
const { poolmysql } = require("../../config/db");

// LISTAR TODOS
async function selectAllDepartamentos() {
  const [rows] = await poolmysql.query(
    `
    SELECT
      d.id,
      d.codigo,
      d.nombre,
      d.sucursal_id,
      s.codigo AS sucursal_codigo,
      s.nombre AS sucursal_nombre
    FROM sis_departamentos d
    LEFT JOIN sis_sucursales s ON s.id = d.sucursal_id
    ORDER BY s.nombre ASC, d.nombre ASC
    `
  );
  return rows;
}

// OBTENER UNO POR ID
async function selectDepartamentoById(id) {
  const [rows] = await poolmysql.query(
    `
    SELECT
      d.id,
      d.codigo,
      d.nombre,
      d.sucursal_id,
      s.codigo AS sucursal_codigo,
      s.nombre AS sucursal_nombre
    FROM sis_departamentos d
    LEFT JOIN sis_sucursales s ON s.id = d.sucursal_id
    WHERE d.id = ?
    `,
    [id]
  );
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

// CREAR
async function insertDepartamento({ codigo, nombre, sucursal_id }) {
  const [result] = await poolmysql.query(
    `
    INSERT INTO sis_departamentos (codigo, nombre, sucursal_id)
    VALUES (?, ?, ?)
    `,
    [codigo ?? null, nombre ?? null, sucursal_id ?? null]
  );
  return result.insertId;
}

// ACTUALIZAR
async function updateDepartamentoById(id, { codigo, nombre, sucursal_id }) {
  await poolmysql.query(
    `
    UPDATE sis_departamentos
    SET
      codigo      = COALESCE(?, codigo),
      nombre      = COALESCE(?, nombre),
      sucursal_id = COALESCE(?, sucursal_id)
    WHERE id = ?
    `,
    [codigo ?? null, nombre ?? null, sucursal_id ?? null, id]
  );
}

// BORRAR
async function deleteDepartamento(id) {
  await poolmysql.query(`DELETE FROM sis_departamentos WHERE id = ?`, [id]);
}

module.exports = {
  selectAllDepartamentos,
  selectDepartamentoById,
  insertDepartamento,
  updateDepartamentoById,
  deleteDepartamento,
};
