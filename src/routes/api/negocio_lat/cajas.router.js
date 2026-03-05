const router = require("express").Router();

const {
  // legacy
  createCaja,
  getCajas,
  getCajaById,
  updateCaja,

  // nuevo flujo PON/NAP
  createPon,
  createNap,
  addCajaSplitter,
  getCajaDisponibilidad,
  getCajaRutasDisponibles,
  getDisponibilidadBatch,

  // ✅ OLTs
  getOlts,
} = require("../../../controllers/negocio_lat/cajas.controllers");

const { checkToken } = require("../../../utils/middlewares");

// ===== NUEVO: Crear PON / NAP =====
router.post("/pon", checkToken, createPon);
router.post("/nap", checkToken, createNap);

// ===== NUEVO: Splitters y cálculos =====
router.post("/:id/splitters", checkToken, addCajaSplitter);
router.post("/disponibilidad-batch", checkToken, getDisponibilidadBatch);
router.get("/:id/disponibilidad", checkToken, getCajaDisponibilidad);
router.get("/:id/rutas-disponibles", checkToken, getCajaRutasDisponibles);

// ✅ OLTs (IMPORTANTE: antes de "/:id")
router.get("/olts", checkToken, getOlts);

// ===== LEGACY / BASE =====
router.get("/", checkToken, getCajas);
router.get("/:id", checkToken, getCajaById);
router.post("/", checkToken, createCaja);
router.put("/:id", checkToken, updateCaja);

module.exports = router;
