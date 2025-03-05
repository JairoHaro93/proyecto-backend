const router = require("express").Router();

const {
  getAllUsuarios,
  createUsuario,
  getUsuarioById,
  updateUsuario,
  deleteByID,
  getAllAgendaTecnicos,
} = require("../../../controllers//sistema/usuarios.controllers");
const { checkUsuarioId } = require("../../../utils/middlewares");

//OBTENER TODOS LOS USUARIOS
router.get("/", getAllUsuarios);

//OBTENER LOS USUARIOS CON OPCION DE AGENDA TECNICOS
router.get("/agenda-tecnicos", getAllAgendaTecnicos);

//OBTENER USUARIOS POR ID
router.get("/:usuarioId", checkUsuarioId, getUsuarioById);

//CREAR USUARIO
router.post("/", createUsuario);

//ACTUALIZAR USUARIO
router.put("/:usuarioId", checkUsuarioId, updateUsuario);

//BORRAR USUARIO
router.delete("/:usuarioId", checkUsuarioId, deleteByID);

module.exports = router;
