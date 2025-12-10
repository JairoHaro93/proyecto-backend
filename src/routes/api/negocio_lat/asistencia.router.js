// routes/negocio_lat/asistencia.routes.js
const router = require("express").Router();
const {
  postMarcarAsistencia,
} = require("../../../controllers/negocio_lat/asistencia.controllers");
const {
  getReporteAsistenciaExcel,
} = require("../../../controllers/negocio_lat/asistencia_reporte.controllers");

// Si quieres protegerlo luego, aquí agregas checkToken
// const { checkToken } = require("../../../middlewares/checkToken");
// router.post("/", checkToken, postMarcarAsistencia);

router.post("/", postMarcarAsistencia);

// Ej: /api/asistencia/reporte-excel?fecha_desde=2025-01-01&fecha_hasta=2025-01-31&departamento_id=3
router.get("/reporte-excel", getReporteAsistenciaExcel);

module.exports = router;
