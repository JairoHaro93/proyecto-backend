const {
  insertInstalacion,
  selectInstalacionesByOrdIns,
  updateInstalacionbyOrdIns,
} = require("../../models/negocio_lat/instalaciones.models");

const getInstalacionByOrdIns = async (req, res, next) => {
  const { ordIns } = req.params;
  try {
    // Verifica si ya existe una instalación registrada para esta orden
    const [instalaciones] = await selectInstalacionesByOrdIns(ordIns);

    res.json(instalaciones);
  } catch (error) {
    next(error);
  }
};

const createInstalacion = async (req, res, next) => {
  try {
    const { ord_ins } = req.body;

    // Verifica si ya existe una instalación registrada para esta orden
    const [instalaciones] = await selectInstalacionesByOrdIns(ord_ins);
    if (instalaciones.length > 0) {
      return res.status(400).json({
        message: "Ya existe una instalación registrada para esta orden.",
      });
    }

    const data = {
      ...req.body,
      registrado_por_id: req.usuario_id, // del token
    };

    const [result] = await insertInstalacion(data);

    res.json({
      message: "Instalación creada correctamente.",
      id: result.insertId,
    });
  } catch (error) {
    next(error);
  }
};

async function terminarInstalacion(req, res) {
  try {
    const { ord_ins } = req.params;
    const { coordenadas, ip } = req.body;

    if (!coordenadas || !ip) {
      return res.status(400).json({
        ok: false,
        message: "Faltan parámetros: coordenadas e ip son requeridos",
      });
    }

    const [result] = await updateInstalacionbyOrdIns({
      ord_ins,
      coordenadas,
      ip,
    });

    if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        message: `No se encontró instalación con ORD_INS=${ord_ins}`,
      });
    }

    return res.json({
      ok: true,
      message: "Instalación actualizada correctamente",
      data: { ord_ins, coordenadas, ip },
    });
  } catch (err) {
    console.error("❌ actualizarCoordsIp:", err);
    return res.status(500).json({ ok: false, message: "Error interno" });
  }
}

module.exports = {
  createInstalacion,
  getInstalacionByOrdIns,
  terminarInstalacion,
};
