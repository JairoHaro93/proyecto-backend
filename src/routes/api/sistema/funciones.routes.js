const router = require("express").Router();

const {
  getAllFunciones,
} = require("../../../controllers/sistema/funciones.controllers");

//const { checkUsuarioId } = require("../../../utils/middlewares");

//Obtener todos los usuarios
router.get("/", getAllFunciones);
//
router.get("/:usuarioId");
//
router.post("/");
//
router.put("/:usuarioId");
//
router.delete("/:usuarioId");
module.exports = router;
