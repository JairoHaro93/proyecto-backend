const {
  getAllDataSoportes,
  createSoporte,
  getSoporteById,
  getAllSoportesPendientes,
  aceptarSoporte,
  getAllSoportesByNoc,
  asignarSolucion,
  asignarTecnico,
  getAllSoportesByTec,
} = require("../../../controllers/negocio_lat/soportes.controllers");
const {
  checkToken,
  checkSoporteOrdIns,
  checkSoportesNocId,
} = require("../../../utils/middlewares");

const router = require("express").Router();

// OBTIENE TODOS LOS SOPORTES
router.get("/", checkToken, getAllDataSoportes);

// OBTIENE LOS SOPORTES PENDIENTES
router.get("/pendientes", checkToken, getAllSoportesPendientes);

//OBTIENE UN SOPORTE POR ORDEN DE INSTALACION
router.get("/:id_sop", checkToken, checkSoporteOrdIns, getSoporteById);

//NOC RECIBE LA INFORMACION DE LOS SOPORTES ACEPTADOS
router.get(
  "/mis-soportes/:id_noc",
  checkSoportesNocId,
  checkToken,
  getAllSoportesByNoc
);

//TECNICO RECIBE LA INFORMACION DE LOS SOPORTES ASIGANDOS
router.get(
  "/mis-soportes-tec/:id_tec",
  checkToken,
  getAllSoportesByTec
);


//CREA UN SOPORTE
router.post("/", checkToken, createSoporte);

//NOC ACEPTA Y ACTUALIZA LA TABLA CON SU USUARIO Y HORA DE ACEPTACION
router.put("/:id_sop", checkToken, aceptarSoporte);

//NOC ACTUALIZA LA TABLA SOLUCION
router.put("/mis-soportes/solucion/:id_sop", checkToken, asignarSolucion);

//NOC ASIGNA UN TECNICO PARA SOPORTE
router.put("/asignar-tecnico/:id_sop", checkToken, asignarTecnico);

module.exports = router;
