// src/routes/sistema/sucursales.routes.js
const router = require("express").Router();

const {
  getAllSucursales,
  getSucursalById,
  createSucursal,
  updateSucursal,
  deleteSucursal,
} = require("../../../controllers/sistema/sucursales.controllers");

const { checkToken } = require("../../../utils/middlewares");

// Listar todas
router.get("/", checkToken, getAllSucursales);

// Obtener una
router.get("/:id", checkToken, getSucursalById);

// Crear
router.post("/", checkToken, createSucursal);

// Actualizar
router.put("/:id", checkToken, updateSucursal);

// Borrar
router.delete("/:id", checkToken, deleteSucursal);

module.exports = router;
