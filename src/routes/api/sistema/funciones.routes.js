const {
  getAllFunciones,
  getFuncionesById,
} = require("../../../controllers/sistema/funciones.controllers");
const { checkToken } = require("../../../utils/middlewares");

const router = require("express").Router();

router.get("/",checkToken, getAllFunciones);
router.get("/:usuarioId",checkToken, getFuncionesById);

module.exports = router;
