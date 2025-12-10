// src/routes/sistema/departamentos.routes.js
const router = require("express").Router();
const {
  getAllDepartamentos,
  getDepartamentoById,
  createDepartamento,
  updateDepartamento,
  deleteDepartamento,
} = require("../../../controllers/sistema/departamentos.controllers");

const { checkToken } = require("../../../utils/middlewares");

// Listar todos
router.get("/", checkToken, getAllDepartamentos);

// Obtener uno
router.get("/:id", checkToken, getDepartamentoById);

// Crear
router.post("/", checkToken, createDepartamento);

// Actualizar
router.put("/:id", checkToken, updateDepartamento);

// Borrar
router.delete("/:id", checkToken, deleteDepartamento);

module.exports = router;
