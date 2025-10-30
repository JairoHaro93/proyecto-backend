const express = require("express");
const {
  testConnection,
} = require("../../../controllers/negocio_lat/olt.controller");

const router = express.Router();

router.get("/test", testConnection);

module.exports = router;
