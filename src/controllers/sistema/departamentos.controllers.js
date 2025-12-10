// src/controllers/sistema/departamentos.controllers.js
const {
  selectAllDepartamentos,
  selectDepartamentoById,
  insertDepartamento,
  updateDepartamentoById,
  deleteDepartamento,
} = require("../../models/sistema/departamentos.models");

// GET /api/departamentos
const getAllDepartamentos = async (req, res, next) => {
  try {
    const lista = await selectAllDepartamentos();
    res.json(lista);
  } catch (err) {
    next(err);
  }
};

// GET /api/departamentos/:id
const getDepartamentoById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dep = await selectDepartamentoById(id);
    if (!dep) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }
    res.json(dep);
  } catch (err) {
    next(err);
  }
};

// POST /api/departamentos
const createDepartamento = async (req, res, next) => {
  try {
    const { codigo, nombre, sucursal_id } = req.body || {};

    if (!nombre) {
      return res
        .status(400)
        .json({ message: "El nombre del departamento es requerido" });
    }

    const insertId = await insertDepartamento({ codigo, nombre, sucursal_id });
    const dep = await selectDepartamentoById(insertId);

    res.status(201).json(dep);
  } catch (err) {
    next(err);
  }
};

// PUT /api/departamentos/:id
const updateDepartamento = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = await selectDepartamentoById(id);
    if (!current) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }

    const { codigo, nombre, sucursal_id } = req.body || {};
    await updateDepartamentoById(id, { codigo, nombre, sucursal_id });

    const dep = await selectDepartamentoById(id);
    res.json(dep);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/departamentos/:id
const deleteDepartamentoCtrl = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = await selectDepartamentoById(id);
    if (!current) {
      return res.status(404).json({ message: "Departamento no encontrado" });
    }

    await deleteDepartamento(id);
    res.json({
      id,
      message: `Departamento "${current.nombre}" eliminado correctamente`,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllDepartamentos,
  getDepartamentoById,
  createDepartamento,
  updateDepartamento,
  deleteDepartamento: deleteDepartamentoCtrl,
};
