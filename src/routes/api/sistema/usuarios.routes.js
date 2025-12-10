const router = require("express").Router();

const {
  getAllUsuarios,
  createUsuario,
  getUsuarioById,
  updateUsuario,
  deleteByID,
  getAllAgendaTecnicos,
  getUsuariosParaTurnos,
} = require("../../../controllers//sistema/usuarios.controllers");
const { checkUsuarioId, checkToken } = require("../../../utils/middlewares");

//OBTENER TODOS LOS USUARIOS
router.get("/", checkToken, getAllUsuarios);

//OBTENER LOS USUARIOS CON OPCION DE AGENDA TECNICOS
router.get("/agenda-tecnicos", checkToken, getAllAgendaTecnicos);

// 🔹 Lista de usuarios filtrados para módulo de turnos (IMPORTANTE: ANTES de :usuarioId)
router.get("/para-turnos", checkToken, getUsuariosParaTurnos);

//OBTENER USUARIOS POR ID
router.get("/:usuarioId", checkUsuarioId, getUsuarioById);

//CREAR USUARIO
router.post("/", createUsuario);

//ACTUALIZAR USUARIO
router.put("/:usuarioId", checkUsuarioId, updateUsuario);

//BORRAR USUARIO
router.delete("/:usuarioId", checkUsuarioId, deleteByID);

module.exports = router;
