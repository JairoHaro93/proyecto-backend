const router = require("express").Router();

const {
  getTimbreConfig,
  putTimbreEnrolar,
  getTimbres,
} = require("../../../controllers/negocio_lat/timbres.controllers");
// const { checkToken } = require("../../../middlewares/auth"); // si quieres proteger

// 🔹 Obtener todos los timbres registrados (para el front)
router.get("/", /*checkToken,*/ getTimbres);

// Config para ESP32 (modo_actual, usuario_enrolando_id, etc.)
router.get("/:codigo/config", getTimbreConfig);

// Poner timbre en modo ENROLAMIENTO para un usuario (lo usará el front)
router.put("/:codigo/enrolar", /*checkToken,*/ putTimbreEnrolar);

module.exports = router;
