const router = require("express").Router();
const { checkToken } = require("../../../utils/middlewares");

const {
  postSolicitarAtraso,
  postSolicitarSalida,
  putResolverAtraso,
  putResolverSalida,
  getPendientes,
} = require("../../../controllers/negocio_lat/justificaciones_turno.controllers");

// Solicitar (usuario)
router.post("/:id/justificaciones/atraso", checkToken, postSolicitarAtraso);
router.post("/:id/justificaciones/salida", checkToken, postSolicitarSalida);

// Resolver (jefe)
router.put(
  "/:id/justificaciones/atraso/resolver",
  checkToken,
  putResolverAtraso
);
router.put(
  "/:id/justificaciones/salida/resolver",
  checkToken,
  putResolverSalida
);

// Pendientes (bandeja jefe / bloqueo reporte)
router.get("/justificaciones/pendientes", checkToken, getPendientes);

module.exports = router;
