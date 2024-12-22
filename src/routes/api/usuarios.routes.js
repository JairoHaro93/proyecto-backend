const router = require("express").Router();

const {
  getAllUsuarios,
  createUsuario,
  getUsuarioById,
  updateUsuario,
  deleteByID,
} = require("../../controllers/usuarios.controllers");
const { checkUsuarioId } = require("../../utils/middlewares");

//Obtener todos los usuarios
router.get("/", getAllUsuarios);
//
router.get("/:usuarioId", checkUsuarioId, getUsuarioById);
//
router.post("/", createUsuario);
//
router.put("/:usuarioId", checkUsuarioId, updateUsuario);
//
router.delete("/:usuarioId", checkUsuarioId, deleteByID);
module.exports = router;
