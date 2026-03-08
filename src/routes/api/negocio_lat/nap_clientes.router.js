const express = require("express");
const router = express.Router();

const { checkToken } = require("../../../utils/middlewares");

const {
  lookupServiciosControl,
  getAsignacionActualByOrdIns,
  getAsignacionActualByOnu,
  createAsignacion,
  liberarAsignacionById,
  liberarAsignacionByOrdIns,
  getHistorial,
} = require("../../../controllers/negocio_lat/nap_clientes.controllers");

router.use(checkToken);

// lookup por lote para el Angular OLT
router.post("/lookup-servicios-control", lookupServiciosControl);

// asignación actual
router.get("/asignacion/ord-ins/:ordIns", getAsignacionActualByOrdIns);
router.get("/asignacion/onu/:onu", getAsignacionActualByOnu);

// crear asignación activa
router.post("/asignacion", createAsignacion);

// liberar asignación
router.post("/asignacion/ord-ins/:ordIns/liberar", liberarAsignacionByOrdIns);
router.post("/asignacion/:id/liberar", liberarAsignacionById);

// historial
router.get("/historial", getHistorial);

module.exports = router;
