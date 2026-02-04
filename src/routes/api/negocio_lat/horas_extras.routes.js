// C:\PROYECTO\Backend\src\routes\api\negocio_lat\horas_extras.routes.js
const router = require("express").Router();
const { checkToken } = require("../../../utils/middlewares");

const {
  postCrearSolicitudHoraExtra,
  getMisSolicitudesHoraExtra,
  getPendientesHoraExtra,
  putAprobarSolicitudHoraExtra,
  putRechazarSolicitudHoraExtra,
  putEliminarSolicitudHoraExtra,

  // ✅ aprobadas
  getAprobadasMovHoraExtra, // NUEVO: detalle desde movimientos (celdas)
  getAprobadasResumenHoraExtra, // existente (resumen)
} = require("../../../controllers/negocio_lat/horas_extras.controllers");

// Usuario
router.post("/solicitudes", checkToken, postCrearSolicitudHoraExtra);
router.get("/mis-solicitudes", checkToken, getMisSolicitudesHoraExtra);
router.put(
  "/solicitudes/:id/eliminar",
  checkToken,
  putEliminarSolicitudHoraExtra,
);

// Aprobador
router.get("/pendientes", checkToken, getPendientesHoraExtra);
router.put(
  "/solicitudes/:id/aprobar",
  checkToken,
  putAprobarSolicitudHoraExtra,
);
router.put(
  "/solicitudes/:id/rechazar",
  checkToken,
  putRechazarSolicitudHoraExtra,
);

// ✅ Aprobadas (desde movimientos)
router.get("/aprobadas", checkToken, getAprobadasMovHoraExtra);

// (opcional) resumen
router.get("/aprobadas-resumen", checkToken, getAprobadasResumenHoraExtra);

module.exports = router;
