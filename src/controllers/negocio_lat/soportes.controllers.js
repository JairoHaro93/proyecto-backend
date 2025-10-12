const {
  selectNombresByOrdInsBatch,
} = require("../../models/negocio/info_clientes.models");
const {
  selectAllSoportes,
  selectSoporteById,
  insertSoporte,
  selectAllSoportesPendientes,
  selectSoporteByOrdIns,
  aceptarSoporteById,
  selectSoportesRevisados,
  updateAsignarSolucion,
  selectAllSoportesByDate,
} = require("../../models/negocio_lat/soportes.models");

//CONTROLADOR PARA OBTENER TODOS LOS SOPORTES
const getAllDataSoportes = async (req, res, next) => {
  try {
    const [result] = await selectAllSoportes();

    if (!result || result.length === 0) {
      return res.json([]); // Devuelve un array vacío en lugar de 404
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER UN SOPORTE POR ID
const getSoporteById = async (req, res, next) => {
  const { id_sop } = req.params;
  try {
    const soporte = await selectSoporteById(id_sop);
    if (!soporte) {
      return res.status(404).json({ message: "El ID de soporte no existe." });
    }
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER TODOS LOS SOPORTES DE UN DIA
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getSoportesByDate(req, res, next) {
  const { fecha } = req.params;

  try {
    if (!ISO_DATE_RE.test(fecha)) {
      return res
        .status(400)
        .json({ message: "Formato de fecha inválido. Usa YYYY-MM-DD." });
    }

    const soportes = await selectAllSoportesByDate(fecha); // array
    if (!Array.isArray(soportes) || soportes.length === 0) {
      return res.status(200).json([]);
    }

    const ordInsList = Array.from(
      new Set(
        soportes
          .map((s) => {
            const n = Number(s.ord_ins);
            return Number.isFinite(n) ? n : null;
          })
          .filter((v) => v !== null)
      )
    );

    let nombresMap = new Map();
    if (ordInsList.length > 0) {
      try {
        const filas = await selectNombresByOrdInsBatch(ordInsList);
        for (const r of filas) {
          nombresMap.set(
            Number(r.orden_instalacion),
            r.nombre_completo || null
          );
        }
      } catch (err) {
        console.warn("⚠️ Falló SQL Server (nombre cliente):", err.message);
        nombresMap = new Map();
      }
    }

    const enriquecidos = soportes.map((s) => {
      const key = Number(s.ord_ins);
      return {
        ...s,
        clienteNombre: Number.isFinite(key)
          ? nombresMap.get(key) ?? null
          : null,
      };
    });

    return res.status(200).json(enriquecidos);
  } catch (error) {
    next(error);
  }
}
//CONTROLADOR PARA OBTENER UN SOPORTE POR ORDINS
const getSoporteByOrdIns = async (req, res, next) => {
  const { soporteOrdIns } = req.params;
  try {
    const soporte = await selectSoporteByOrdIns(soporteOrdIns);
    if (!soporte) {
      return res.status(404).json({ message: "El ID de soporte no existe." });
    }
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER TODOS LOS SOPORTES PENDIENTES
const getAllSoportesPendientes = async (req, res, next) => {
  try {
    const [result] = await selectAllSoportesPendientes();
    // Verificamos si el array está vacío

    if (!result || result.length === 0) {
      return res.json([]); // Devuelve un array vacío en lugar de 404
    }
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA CREAR UN SOPORTE
const createSoporte = async (req, res, next) => {
  try {
    const { ord_ins } = req.body;

    // Verifica si ya existe un soporte para esta orden
    const soportes = await selectSoporteByOrdIns(ord_ins);

    // Si alguno no está resuelto, no se permite crear uno nuevo
    const soporteActivo = soportes.find(
      (s) => !["RESUELTO", "CULMINADO"].includes(s.reg_sop_estado)
    );
    console.log(soporteActivo);
    if (soporteActivo) {
      return res.status(400).json({
        message: "Ya existe un soporte activo para esta orden de instalación.",
      });
    }

    // Inserta el nuevo soporte
    const [result] = await insertSoporte(req.body);
    const soporte = await selectSoporteById(result.insertId);

    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA QUE NOC ACPETE EL SOPORTE
const aceptarSoporte = async (req, res, next) => {
  const { id_sop } = req.params;

  try {
    await aceptarSoporteById(id_sop, req.body);
    const soporte = await selectSoporteById(id_sop);
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA QUE NOC ASIGNE UNA SOLUCION
const asignarSolucion = async (req, res) => {
  const { id_sop } = req.params;

  if (!req.body.reg_sop_estado && !req.body.reg_sop_sol_det) {
    return res.status(400).json({ message: "Faltan campos requeridos" });
  }

  try {
    await updateAsignarSolucion(id_sop, req.body);
    const soporte = await selectSoporteById(id_sop);
    res.json(soporte);
  } catch (error) {
    console.error("❌ Error al asignar solución:", error);
    res.status(500).json({ message: "Error al actualizar el soporte", error });
  }
};

// CONTROLADOR PARA OBTENER TODOS LOS SOPORTES DE NOC
const getAllSoportesRevisados = async (req, res, next) => {
  try {
    const soporte = await selectSoportesRevisados();

    if (!soporte || soporte.length === 0) {
      return res.json([]); // Devuelve un array vacío en lugar de 404
    }

    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllDataSoportes,
  getSoporteById,
  getSoporteByOrdIns,
  asignarSolucion,
  getSoportesByDate,
  getAllSoportesPendientes,
  createSoporte,
  aceptarSoporte,
  getAllSoportesRevisados,
};
