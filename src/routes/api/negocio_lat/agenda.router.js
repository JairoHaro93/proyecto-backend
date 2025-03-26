const {

  getAgendaByFecha,
  postAgenda,
} = require("../../../controllers/negocio_lat/agenda.controllers");
const { checkToken } = require("../../../utils/middlewares");

const router = require("express").Router();



// OBTIENE TODOS LOS SOPORTES
router.get("/:fecha", checkToken, getAgendaByFecha);



// OBTIENE TODOS LOS SOPORTES
router.post("/crear", checkToken, postAgenda);



module.exports = router;
