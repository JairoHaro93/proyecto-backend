const router = require("express").Router();

const {
  createVis,
  getVisById,
  updateVisById,
  getAllVisByOrdIns,
} = require("../../../controllers/negocio_lat/vis.controllers");
const { checkToken } = require("../../../utils/middlewares");

//OBTIENE UNA VISITA POR ID
router.get("/:id_vis", checkToken, getVisById);

//OBTIENE UNA LISTA CON TODOS LAS VISITAS DE UNA ORDINS
router.get("/visitas/:ord_ins", checkToken, getAllVisByOrdIns);

//CREA UNA VISITA
router.post("/", checkToken, createVis);

//ACTUALIZA UNA VISITA
router.put("/:id_vis", checkToken, updateVisById);

module.exports = router;
