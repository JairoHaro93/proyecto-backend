const e = require("express");
const pool = require("../../config/db");

// SELECT * FROM usuarios
function selectAllFuncionesAdmin() {
  return pool.query("SELECT * FROM sisFunAdmin ");
}

function selectAllFuncionesBodega() {
  return pool.query("SELECT * FROM sisFunBod ");
}

function selectAllFuncionesNoc() {
  return pool.query("SELECT * FROM sisFunNoc ");
}

// INSERT usuario y funcion en funAdmin
function insertFuncionesAdmin(usuarioId, funciones_adminId) {
  funciones_adminId.forEach((element) => {
    return pool.query(
      ` INSERT INTO sisUsuarios_has_sisFunAdmin (
    sisUsuarios_id,
    sisFunAdmin_id
) VALUES (?,?);`,
      [usuarioId, element]
    );
  });
}

// INSERT usuario y funcion en funAdmin
function insertFuncionesBod(usuarioId, funciones_bodId) {
  funciones_bodId.forEach((element) => {
    return pool.query(
      ` INSERT INTO sisUsuarios_has_sisFunBod (
    sisUsuarios_id,
    sisFunBod_id
) VALUES (?,?);`,
      [usuarioId, element]
    );
  });
}

// INSERT usuario y funcion en funAdmin
function insertFuncionesNoc(usuarioId, funciones_nocId) {
  funciones_nocId.forEach((element) => {
    return pool.query(
      ` INSERT INTO sisUsuarios_has_sisFunNoc (
    sisUsuarios_id,
    sisFunNoc_id
) VALUES (?,?);`,
      [usuarioId, element]
    );
  });
}

module.exports = {
  selectAllFuncionesAdmin,
  selectAllFuncionesBodega,
  selectAllFuncionesNoc,
  insertFuncionesAdmin,
  insertFuncionesBod,
  insertFuncionesNoc,
};
