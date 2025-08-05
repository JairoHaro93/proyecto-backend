const router = require("express").Router();

const {
  createVis,
  getVisById,
  updateVisById,
} = require("../../../controllers/negocio_lat/vis.controllers");
const { checkToken } = require("../../../utils/middlewares");

//OBTIENE UNA VISITA POR ID
router.get("/:id_vis", checkToken, getVisById);

//CREA UNA VISITA
router.post("/", checkToken, createVis);

//ACTUALIZA UNA VISITA
router.put("/:id_vis", checkToken, updateVisById);

module.exports = router;
