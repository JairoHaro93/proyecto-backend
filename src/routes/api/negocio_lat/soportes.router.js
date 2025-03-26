const {
  getAllDataSoportes,
  createSoporte,
  getSoporteById,
  getAllSoportesPendientes,
  aceptarSoporte,
  getSoporteByOrdIns,
  getAllSoportesByNoc,
  asignarSolucion,
  asignarTecnico,
  getAllSoportesParaTec,
} = require("../../../controllers/negocio_lat/soportes.controllers");
const {
  checkToken,
  checkSoporteId,
  checkSoporteOrdIns,
  checkSoportesNocId,
} = require("../../../utils/middlewares");

const router = require("express").Router();

// OBTIENE TODOS LOS SOPORTES
router.get("/", checkToken, getAllDataSoportes);

// OBTIENE LOS SOPORTES PENDIENTES
router.get("/pendientes", checkToken, getAllSoportesPendientes);

//NOC RECIBE LA INFORMACION DE LOS SOPORTES POSIBLES PARA ASIGNAR A UN TECNICO, (VISITA Y LOS)
router.get("/listar-tecnico", checkToken, getAllSoportesParaTec);

//OBTIENE UN SOPORTE POR ORDEN DE INSTALACION
router.get("/:soporteId", checkToken, checkSoporteOrdIns, getSoporteById);

//NOC RECIBE LA INFORMACION DE LOS SOPORTES ACEPTADOS
router.get("/mis-soportes/:noc_id", checkToken, getAllSoportesByNoc);

//CREA UN SOPORTE
router.post("/", checkToken, createSoporte);

//NOC ACTUALIZA LA TABLA CON SU USUARIO Y HORA DE ACEPTACION
router.put("/:soporteId", checkToken, aceptarSoporte);

//NOC ACTUALIZA LA TABLA SOLUCION
router.put("/mis-soportes/solucion/:soporteId", checkToken, asignarSolucion);

//NOC ASIGNA UN TECNICO PARA SOPORTE
router.put("/asignar-tecnico/:soporteId", checkToken, asignarTecnico);

module.exports = router;
