const router = require("express").Router();
const {
  getTurnos,
  postGenerarTurnos,
  putTurno,
  deleteTurno,
  putActualizarTurno,
} = require("../../../controllers/negocio_lat/turnos.controllers");
const { checkToken } = require("../../../utils/middlewares");

router.get("/", checkToken, getTurnos);
router.post("/generar", checkToken, postGenerarTurnos);

// 🔹 Editar turno puntual
router.put("/:turnoId", checkToken, putActualizarTurno);

// 🔹 Eliminar turno puntual
router.delete("/:turnoId", checkToken, deleteTurno);

module.exports = router;
