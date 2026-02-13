// src/routes/api/negocio_lat/olt.router.js
const router = require("express").Router();
const { testTime, status, exec } = require("../../../controllers/negocio_lat/olt.controller");

// router.use(checkToken)  // si quieres protegerlo

router.get("/test", testTime);
router.get("/status", status);
router.post("/exec", exec);

module.exports = router;
