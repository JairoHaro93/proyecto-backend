// src/models/sistema/sucursales.models.js
const { poolmysql } = require("../../config/db");

// LISTAR TODAS
async function selectAllSucursales() {
  const [rows] = await poolmysql.query(
    `
    SELECT
      id,
      codigo,
      nombre
    FROM sis_sucursales
    ORDER BY nombre ASC
    `
  );
  return rows;
}

// OBTENER UNA POR ID
async function selectSucursalById(id) {
  const [rows] = await poolmysql.query(
    `
    SELECT
      id,
      codigo,
      nombre
    FROM sis_sucursales
    WHERE id = ?
    `,
    [id]
  );

  if (!rows || rows.length === 0) return null;
  return rows[0];
}

// CREAR
async function insertSucursal({ codigo, nombre }) {
  const [result] = await poolmysql.query(
    `
    INSERT INTO sis_sucursales (codigo, nombre)
    VALUES (?, ?)
    `,
    [codigo ?? null, nombre ?? null]
  );
  return result.insertId;
}

// ACTUALIZAR
async function updateSucursalById(id, { codigo, nombre }) {
  await poolmysql.query(
    `
    UPDATE sis_sucursales
    SET
      codigo = COALESCE(?, codigo),
      nombre = COALESCE(?, nombre)
    WHERE id = ?
    `,
    [codigo ?? null, nombre ?? null, id]
  );
}

// BORRAR
async function deleteSucursal(id) {
  await poolmysql.query(`DELETE FROM sis_sucursales WHERE id = ?`, [id]);
}

module.exports = {
  selectAllSucursales,
  selectSucursalById,
  insertSucursal,
  updateSucursalById,
  deleteSucursal,
};
