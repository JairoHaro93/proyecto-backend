// src/routes/api/negocio_lat/vacaciones.router.js
const router = require("express").Router();
const { checkUsuarioId } = require("../../../utils/middlewares");

const {
  getVacConfig,
  getMiSaldo,
  getResumenUsuario,
  listAsignaciones,
  previewAsignacion,
  createAsignacion,
  anularAsignacion,
  getActaAsignacion,
} = require("../../../controllers/negocio_lat/vacaciones.controllers");

function requireAnyRole(roles = []) {
  return (req, res, next) => {
    const arr = Array.isArray(req.user?.rol) ? req.user.rol : [];
    const ok = roles.some((r) => arr.includes(r));
    if (!ok) return res.status(403).json({ message: "No autorizado (rol)" });
    next();
  };
}

const requireJefe = requireAnyRole(["ATurnos", "AHorarios"]);

// Config
router.get("/config", requireJefe, getVacConfig);

// Trabajador (Flutter)
router.get("/mi-saldo", getMiSaldo);

// Jefe (Angular)
router.get(
  "/resumen/usuario/:usuarioId",
  requireJefe,
  checkUsuarioId,
  getResumenUsuario
);
router.get("/asignaciones", requireJefe, listAsignaciones);
router.post("/asignaciones/preview", requireJefe, previewAsignacion);
router.post("/asignaciones", requireJefe, createAsignacion);
router.post("/asignaciones/:id/anular", requireJefe, anularAsignacion);

// Acta (descarga privada via /api/files/:fileId/download)
router.get("/asignaciones/:id/acta", getActaAsignacion);

module.exports = router;
