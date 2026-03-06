// C:\PROYECTO\Backend\src\routes\api\sistema\usuarios.routes.js
const router = require("express").Router();

const {
  getAllUsuarios,
  createUsuario,
  getUsuarioById,
  updateUsuario,
  deleteByID,
  getAllAgendaTecnicos,
  getUsuariosParaTurnos,
  getMisCiudadesCobertura,
  getMisDepartamentosControl,
} = require("../../../controllers/sistema/usuarios.controllers");

const { checkUsuarioId, checkToken } = require("../../../utils/middlewares");

// ======================
// RUTAS ESPECÍFICAS PRIMERO
// ======================

// OBTENER TODOS LOS USUARIOS
router.get("/", checkToken, getAllUsuarios);

// OBTENER LOS USUARIOS CON OPCION DE AGENDA TECNICOS
router.get("/agenda-tecnicos", checkToken, getAllAgendaTecnicos);

// Lista de usuarios filtrados para módulo de turnos
router.get("/para-turnos", checkToken, getUsuariosParaTurnos);

// ✅ OBTENER LAS CIUDADES DE COBERTURA DE MI SUCURSAL (por usuario autenticado)
router.get("/ciudades-cobertura/mias", checkToken, getMisCiudadesCobertura);

router.get(
  "/departamentos-control/mios",
  checkToken,
  getMisDepartamentosControl,
);

// ======================
// RUTAS CON PARAMETROS AL FINAL
// ======================

// OBTENER USUARIO POR ID
router.get("/:usuarioId", checkToken, checkUsuarioId, getUsuarioById);

// CREAR USUARIO
router.post("/", checkToken, createUsuario);

// ACTUALIZAR USUARIO
router.put("/:usuarioId", checkToken, checkUsuarioId, updateUsuario);

// BORRAR USUARIO
router.delete("/:usuarioId", checkToken, checkUsuarioId, deleteByID);

module.exports = router;
