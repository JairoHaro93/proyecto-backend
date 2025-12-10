const {
  selectConfigByCodigo,

  setEnrolamiento,
  setProduccion,
  selectAllTimbres,
} = require("../../models/negocio_lat/timbres.models");
const { poolmysql } = require("../../config/db");

// 🔹 GET /api/timbres
// Devuelve todos los timbres registrados (para usar en el front)
const getTimbres = async (req, res, next) => {
  try {
    const [rows] = await selectAllTimbres();

    // Si quieres devolver siempre array aunque esté vacío:
    return res.json(rows || []);
  } catch (error) {
    console.error("Error en getTimbres:", error);
    next(error);
  }
};

// GET /api/timbres/:codigo/config
const getTimbreConfig = async (req, res, next) => {
  try {
    const { codigo } = req.params;

    const [rows] = await selectConfigByCodigo(codigo);
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Timbre no registrado en neg_t_timbres",
      });
    }

    const t = rows[0];

    return res.json({
      ok: true,
      lector_codigo: t.codigo,
      modo_actual: t.modo_actual, // 'PRODUCCION' o 'ENROLAMIENTO'
      sucursal: t.sucursal,
      tipo: t.tipo,
      last_heartbeat: t.last_heartbeat,
      usuario_enrolando_id: t.usuario_enrolando_id || 0,
    });
  } catch (error) {
    console.error("Error en getTimbreConfig:", error);
    next(error);
  }
};

// PUT /api/timbres/:codigo/enrolar
// Body: { usuario_id }
const putTimbreEnrolar = async (req, res, next) => {
  try {
    const { codigo } = req.params;
    const { usuario_id } = req.body;

    if (!usuario_id) {
      return res.status(400).json({
        ok: false,
        message: "El campo 'usuario_id' es obligatorio",
      });
    }

    // Validar timbre
    const [timbres] = await selectConfigByCodigo(codigo);
    if (!timbres || timbres.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Timbre no registrado",
      });
    }

    const timbre = timbres[0];
    if (timbre.tipo !== "MAESTRO") {
      return res.status(400).json({
        ok: false,
        message: "Solo los timbres MAESTRO pueden enrolar huellas",
      });
    }

    // Validar usuario
    const [users] = await poolmysql.query(
      "SELECT id, nombre, apellido FROM sisusuarios WHERE id = ? LIMIT 1",
      [usuario_id]
    );
    if (!users || users.length === 0) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no existe",
      });
    }
    const user = users[0];

    await setEnrolamiento(codigo, usuario_id);

    return res.json({
      ok: true,
      message: "Timbre puesto en modo ENROLAMIENTO",
      lector_codigo: codigo,
      usuario_id,
      usuario_nombre: `${user.nombre} ${user.apellido}`,
    });
  } catch (error) {
    console.error("Error en putTimbreEnrolar:", error);
    next(error);
  }
};

module.exports = {
  getTimbreConfig,
  putTimbreEnrolar,
  getTimbres,
};
