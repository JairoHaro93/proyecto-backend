// src/routes/api/negocio_lat/olt.router.js
const express = require("express");
const router = express.Router();

const {
  status,
  testTime,
  exec,
  close,
} = require("../../../controllers/negocio_lat/olt.controller");
const { checkToken } = require("../../../utils/middlewares");

// GET /api/olt/status
router.get("/status", checkToken, status);

// GET /api/olt/test
router.get("/test", checkToken, testTime);

// POST /api/olt/exec
router.post("/exec", exec);

// POST /api/olt/close (opcional)
router.post("/close", checkToken, close);

module.exports = router;
