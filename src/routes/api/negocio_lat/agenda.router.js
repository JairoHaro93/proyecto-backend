const {
  getAgendaByFecha,
  postAgenda,
  asignarTecnicoAge,
  getPreAgenda,
  postAgendaSop,
  putAgendaHorario,
  getAllTrabajosByTec,
  putAgendaSolucion,
  getInfoSolByAgeId,
  getAgendaPendienteByFecha,
  postImagenSolu,
} = require("../../../controllers/negocio_lat/agenda.controllers");
const { checkToken, upload } = require("../../../utils/middlewares");

const router = require("express").Router();

// OBTIENE TODOS LOS TRABAJOS PRE AGENDA
router.get("/", checkToken, getPreAgenda);

// OBTIENE TODOS LOS TRABAJOS PRE AGENDA
router.get("/preagenda", checkToken, getPreAgenda);

// OBTIENE LOS TRABAJOS CON RESPECTO A UNA FECHA INDICADA
router.get("/:fecha", checkToken, getAgendaByFecha);

// OBTIENE LOS TRABAJOS CON RESPECTO A UNA FECHA INDICADA
router.get("/pendientes/:fecha", checkToken, getAgendaPendienteByFecha);

//TECNICO RECIBE LA INFORMACION DE LOS TRABAJOS ASIGANDOS
router.get("/mis-trabajos-tec/:id_tec", checkToken, getAllTrabajosByTec);

//MUESTRA LA INFORMACION DE LA SOLUCION DEL TRABAJO AGENDADO
router.get("/sol/:age_id", checkToken, getInfoSolByAgeId);

// CREA UN TRABAJO EN LA AGENDA
router.post("/crear", checkToken, postAgenda);

// CREA UN SOPORTE EN LA AGENDA
router.post("/agenda-sop", checkToken, postAgendaSop);

// SUBE LA IMAGEN DE LA SOLUCION DEL TRABAJO
router.post(
  "/images/soluciones",
  checkToken,
  upload.single("imagen"),
  postImagenSolu
);

//NOC ACTUALIZA UN TECNICO DEL TRABAJO DE LA AGENDA
router.put("/asignar-tecnico/:id_sop", checkToken, asignarTecnicoAge);

// INSERTA UNA FECHA Y HORA PARA EL TRABAJO
router.put("/edita-hora/:age_id", checkToken, putAgendaHorario);

// INSERTA UNA SOLUCION Y CAMBIA EL ESTADO PARA EL TRABAJO
router.put("/edita-sol/:age_id", checkToken, putAgendaSolucion);

module.exports = router;
