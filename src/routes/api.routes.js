const { checkToken } = require("../utils/middlewares");

const router = require("express").Router();

//SISTEMA

router.use("/usuarios", require("./api/sistema/usuarios.routes"));
router.use("/login", require("./api/sistema/login.routes"));
router.use("/funciones", checkToken, require("./api/sistema/funciones.routes"));
router.use("/asistencia", require("./api/negocio_lat/asistencia.router"));
router.use("/huellas", require("./api/negocio_lat/huellas.router"));
router.use("/timbres", require("./api/negocio_lat/timbres.routes"));
router.use("/turnos", require("./api/negocio_lat/turnos.router"));
router.use(
  "/justificacion",
  require("./api/negocio_lat/justificaciones_turno.routes")
);
router.use("/departamentos", require("./api/sistema/departamentos.routes"));
router.use("/sucursales", require("./api/sistema/sucursales.routes"));

//NEGOCIO ATUNTAQUI
router.use("/clientes", checkToken, require("./api/negocio/clientes.router"));

//NEGOCIO LATACUNGA
router.use(
  "/soportes",
  checkToken,
  require("./api/negocio_lat/soportes.router")
);
router.use("/vis", checkToken, require("./api/negocio_lat/vis.router"));
router.use(
  "/instalaciones",
  checkToken,
  require("./api/negocio_lat/instalaciones.router")
);

router.use("/agenda", checkToken, require("./api/negocio_lat/agenda.router"));

router.use(
  "/infraestructura",
  require("./api/negocio_lat/infraestructura.router")
);
router.use("/images", require("./api/negocio_lat/images.router"));
router.use("/cajas", require("./api/negocio_lat/cajas.router"));
router.use("/olt", require("./api/negocio_lat/olt.router"));

module.exports = router;
