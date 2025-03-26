const {
  getAgendaById,
} = require("../../../controllers/negocio_lat/agenda.controllers");
const { checkToken } = require("../../../utils/middlewares");

const router = require("express").Router();

// OBTIENE TODOS LOS SOPORTES
router.get("/:fecha", checkToken, getAgendaById);

module.exports = router;
