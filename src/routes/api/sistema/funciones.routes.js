const {
  getAllFunciones,
} = require("../../../controllers/sistema/funciones.controllers");

const router = require("express").Router();

router.get("/", getAllFunciones);

module.exports = router;
