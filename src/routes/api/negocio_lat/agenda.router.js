const {
  getAgendaByFecha,
  postAgenda,
  asignarTecnicoAge,
  getPreAgenda,
  postAgendaSop,
  putAgenda,
} = require("../../../controllers/negocio_lat/agenda.controllers");
const { checkToken } = require("../../../utils/middlewares");

const router = require("express").Router();

// OBTIENE TODOS LOS TRABAJOS PRE AGENDA
router.get("/", checkToken, getPreAgenda);

// OBTIENE TODOS LOS TRABAJOS PRE AGENDA
router.get("/preagenda", checkToken, getPreAgenda);

// OBTIENE LOS TRABAJOS CON RESPECTO A UNA FECHA INDICADA
router.get("/:fecha", checkToken, getAgendaByFecha);

// CREA UN TRABAJO EN LA AGENDA
router.post("/crear", checkToken, postAgenda);

// CREA UN SOPORTE EN LA AGENDA
router.post("/agenda-sop", checkToken, postAgendaSop);

//NOC ACTUALIZA UN TECNICO DEL TRABAJO DE LA AGENDA
router.put("/asignar-tecnico/:id_sop", checkToken, asignarTecnicoAge);

// INSERTA UNA FECHA Y HORA PARA EL TRABAJO
router.put("/edita/:age_id", checkToken, putAgenda);

module.exports = router;
