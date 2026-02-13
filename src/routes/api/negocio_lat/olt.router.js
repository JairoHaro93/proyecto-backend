// src/routes/api/negocio_lat/olt.router.js
const { Router } = require("express");
const router = Router();

const { status, testTime, exec } = require("../../../controllers/negocio_lat/olt.controller");

// base: /api/olt
router.get("/status", status);
router.get("/test", testTime);
router.post("/exec", exec);

module.exports = router;
