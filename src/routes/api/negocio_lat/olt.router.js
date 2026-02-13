// src/routes/api/negocio_lat/olt.router.js
const router = require("express").Router();
const { testTime } = require("../../../controllers/negocio_lat/olt.controller");

// ✅ si quieres proteger con token, aquí pones tu middleware checkToken
// const { checkToken } = require("../../../utils/middlewares");
// router.get("/test", checkToken, testTime);

router.get("/test", testTime);

module.exports = router;
