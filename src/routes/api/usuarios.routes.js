const router = require("express").Router();

const {
  getAllUsuarios,
  createUsuario,
  getUsuarioById,
  updateUsuario,
  deleteByID,
} = require("../../controllers/usuarios.controllers");

//Obtener todos los usuarios
router.get("/", getAllUsuarios);
//
router.get("/:usuarioId", getUsuarioById);
//
router.post("/", createUsuario);
//
router.put("/:usuarioId", updateUsuario);
//
router.delete("/:usuarioId", deleteByID);
module.exports = router;
