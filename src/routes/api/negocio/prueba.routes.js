const {
  getAllPrueba,
} = require("../../../controllers/negocio/prueba.controllers");

const router = require("express").Router();

router.get("/", getAllPrueba);

module.exports = router;
