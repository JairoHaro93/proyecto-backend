const express = require("express");
const router = express.Router();

const {
  login,
  logout,
  me,
  loginapp,
} = require("../../../controllers/sistema/login.controllers");
const { checkToken } = require("../../../utils/middlewares");

// Middleware para recibir texto plano desde sendBeacon
router.use(express.text({ type: "*/*" }));

// Rutas
router.post("/", login); // POST /api/login
router.post("/app", loginapp); // POST /api/login
router.post("/not", logout); // POST /api/login/not
router.get("/me", checkToken, me);

module.exports = router;
