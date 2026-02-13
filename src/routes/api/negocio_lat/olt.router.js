// src/routes/api/negocio_lat/olt.router.js
const express = require("express");
const router = express.Router();

const {
  status,
  testTime,
  exec,
  close,
} = require("../../../controllers/negocio_lat/olt.controller");

// GET /api/olt/status
router.get("/status", status);

// GET /api/olt/test
router.get("/test", testTime);

// POST /api/olt/exec
router.post("/exec", exec);

// POST /api/olt/close (opcional)
router.post("/close", close);

module.exports = router;
