// routes/api/sistema/login.routes.js
const express = require("express");
const router = express.Router();

const {
  login,
  logout,
  me,
  loginapp,
  logoutapp,
} = require("../../../controllers/sistema/login.controllers");
const { checkToken } = require("../../../utils/middlewares");

// ⚠️ No apliques text("*/*") global: rompe JSON.
// Habilita text/plain SOLO donde lo necesitas (sendBeacon).
const textPlain = express.text({ type: "text/plain" });

// --- Web (cookies HttpOnly) ---
router.post("/", login); // espera JSON (no tocar)
router.get("/me", checkToken, me);
router.post("/not", textPlain, logout); // soporta sendBeacon text/plain

// --- App (móvil) --- (déjalo igual si usa JSON/Bearer)
router.post("/app", loginapp);
router.post("/notapp", textPlain, logoutapp);

module.exports = router;
