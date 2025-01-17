const {
  getAllFunciones,
  getFuncionesById,
} = require("../../../controllers/sistema/funciones.controllers");

const router = require("express").Router();

router.get("/", getAllFunciones);
router.get("/:usuarioId", getFuncionesById);

module.exports = router;
