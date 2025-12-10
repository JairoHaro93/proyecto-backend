const router = require("express").Router();
const {
  postHuellasEnrolar,
  deleteHuellasUsuarioTimbre,
  getHuellasActivasByLector,
} = require("../../../controllers/negocio_lat/huellas.controllers");

// Endpoint que llama la ESP32 luego de enrolar la huella en el sensor
router.post("/enrolar", postHuellasEnrolar);

// Obtener huellas ACTIVAS por timbre (para Angular)
router.get("/:lector_codigo", /*checkToken,*/ getHuellasActivasByLector);

// Eliminar todas las huellas de un usuario en un timbre concreto
router.delete(
  "/:lector_codigo/usuario/:usuario_id",
  /*checkToken,*/ deleteHuellasUsuarioTimbre
);

module.exports = router;
