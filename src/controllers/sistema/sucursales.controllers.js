// src/controllers/sistema/sucursales.controllers.js
const {
  selectAllSucursales,
  selectSucursalById,
  insertSucursal,
  updateSucursalById,
  deleteSucursal,
} = require("../../models/sistema/sucursales.models");

// GET /api/sucursales
const getAllSucursales = async (req, res, next) => {
  try {
    const lista = await selectAllSucursales();
    res.json(lista);
  } catch (err) {
    next(err);
  }
};

// GET /api/sucursales/:id
const getSucursalById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const suc = await selectSucursalById(id);
    if (!suc) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }
    res.json(suc);
  } catch (err) {
    next(err);
  }
};

// POST /api/sucursales
const createSucursal = async (req, res, next) => {
  try {
    const { codigo, nombre } = req.body || {};

    if (!nombre) {
      return res
        .status(400)
        .json({ message: "El nombre de la sucursal es requerido" });
    }

    const insertId = await insertSucursal({ codigo, nombre });
    const suc = await selectSucursalById(insertId);

    res.status(201).json(suc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/sucursales/:id
const updateSucursal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = await selectSucursalById(id);
    if (!current) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    const { codigo, nombre } = req.body || {};
    await updateSucursalById(id, { codigo, nombre });

    const suc = await selectSucursalById(id);
    res.json(suc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/sucursales/:id
const deleteSucursalCtrl = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = await selectSucursalById(id);
    if (!current) {
      return res.status(404).json({ message: "Sucursal no encontrada" });
    }

    await deleteSucursal(id);
    res.json({
      id,
      message: `Sucursal "${current.nombre}" eliminada correctamente`,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllSucursales,
  getSucursalById,
  createSucursal,
  updateSucursal,
  deleteSucursal: deleteSucursalCtrl,
};
