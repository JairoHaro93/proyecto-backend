// \src\routes\api\negocio_lat\turnos.router.js

const router = require("express").Router();
const {
  getTurnos,
  postGenerarTurnos,
  deleteTurno,
  putActualizarTurno,
  getMiHorarioSemana,
  putObservacionTurnoHoy,
  putEstadoHoraAcumuladaTurno,
  putAsignarDevolucion,
} = require("../../../controllers/negocio_lat/turnos.controllers");

const { checkToken } = require("../../../utils/middlewares");

router.get("/", checkToken, getTurnos);
router.post("/generar", checkToken, postGenerarTurnos);
router.put("/:turnoId", checkToken, putActualizarTurno);
router.delete("/:turnoId", checkToken, deleteTurno);

router.get("/mi-horario", checkToken, getMiHorarioSemana);
router.put("/mi-horario/observacion", checkToken, putObservacionTurnoHoy);

// ✅ aprobar / rechazar solicitudes
router.put("/hora-acumulada/:turnoId", checkToken, putEstadoHoraAcumuladaTurno);

router.put("/devolucion/:id", checkToken, putAsignarDevolucion);

module.exports = router;
