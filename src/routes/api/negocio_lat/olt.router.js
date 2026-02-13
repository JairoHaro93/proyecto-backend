// src/routes/api/negocio_lat/olt.router.js
const router = require("express").Router();

// ajusta este path si en tu proyecto está en otro lugar
const { checkToken } = require("../../../utils/middlewares");

const {
  testTime,
  getStatus,
} = require("../../../controllers/negocio_lat/olt.controller");

// ✅ protegido
//router.get("/test", checkToken, testTime);
//router.get("/status", checkToken, getStatus);

// ❌ sin auth (si lo quieres temporalmente)
 router.get("/test", testTime);
 router.get("/status", getStatus);

module.exports = router;
