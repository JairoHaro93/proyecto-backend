// src/routes/api/negocio_lat/olt.router.js
const router = require("express").Router();
const { testTime } = require("../../../controllers/negocio_lat/olt.controller");

// si usas checkToken:
const { checkToken } = require("../../../utils/middlewares");

router.get("/time", checkToken, testTime);

// si por ahora no quieres auth, temporalmente:
// router.get("/time", testTime);

module.exports = router;
