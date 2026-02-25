const {
  selectAllDataMapa,

  selectAllDataArrayByCed,
  selectDataArrayActivosByCed,

  selectByOrdnIns,
  selectAllInstPend,
  selectClientesSugerenciasActivos,
  selectClientesSugerencias,
  fetchClientesByOrdInsBatch,
} = require("../../models/negocio/info_clientes.models");

//CONTROLADOR PARA OBTENER LOS NOMBRES Y CEDULA
const buscarClientes = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({ message: "Mínimo 2 caracteres" });
    }

    const limitParam = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 50)
      : 15;

    const sucursal = "LATACUNGA"; // fija por ahora (sin authScope)

    const data = await selectClientesSugerencias({
      term: q,
      sucursal,
      limit,
    });

    res.json(data); // [{ cedula, nombre_completo }]
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER LOS NOMBRES Y CEDULA CON SERVICIOS ACTIVOS
const buscarClientesActivos = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) {
      return res.status(400).json({ message: "Mínimo 2 caracteres" });
    }

    const limitParam = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 50)
      : 15;

    const sucursal = "LATACUNGA"; // fija por ahora (sin authScope)

    const data = await selectClientesSugerenciasActivos({
      term: q,
      sucursal,
      limit,
    });

    res.json(data); // [{ cedula, nombre_completo }]
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA OBTENER todos los datos en array
const getAllDataArray = async (req, res, next) => {
  const { cedula } = req.params; // ✅ primero declaras

  try {
    const result = await selectAllDataArrayByCed(cedula); // luego usas

    if (!result) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Error en getAllDataArray:", error.message);
    next(error);
  }
};

// CONTROLADOR PARA OBTENER los clientes con servicios activos
const getDataArrayActivos = async (req, res, next) => {
  const { cedula } = req.params; // ✅ primero declaras

  try {
    const result = await selectDataArrayActivosByCed(cedula); // luego usas

    if (!result) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Error en getAllDataArray:", error.message);
    next(error);
  }
};

//CONTROLADOR PARA OBTENER LOS DATOS DE TODOS LOS CLIENTES PARA MOSTRARLOS EN EL MAPA
// controllers/negocio/info_clientes.controllers.js
const getAllDataMapa = async (req, res, next) => {
  try {
    const suc_id = Number(req.query.suc_id || 0) || null; // opcional
    const min_meses = Number(req.query.min_meses || 0) || 0; // opcional
    const incluir_eliminados =
      String(req.query.incluir_eliminados ?? "true").toLowerCase() !== "false";

    const result = await selectAllDataMapa({
      suc_id,
      min_meses,
      incluir_eliminados,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};
//CONTROLADOR PARA OBTENER UN SOPORTE POR ORDINS
const getServicioByOrdIns = async (req, res, next) => {
  const { servicioOrdIns } = req.params;
  try {
    //const soporte = await selectServiceByOrdIns(servicioOrdIns);
    const soporte = await selectByOrdnIns(servicioOrdIns);

    if (!soporte) {
      return res
        .status(404)
        .json({ message: "La orden de instalacion del servicio no existe." });
    }
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER UN SOPORTE POR ORDINS

const getAllInstPend = async (req, res, next) => {
  try {
    const result = await selectAllInstPend();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER MULTIPLES SERVICIOS POR VARIOS ORDINS
async function getClientesByOrdInsBatch(req, res) {
  try {
    const { ord_ins } = req.body || {};
    if (!Array.isArray(ord_ins) || ord_ins.length === 0) {
      return res
        .status(400)
        .json({ message: "ord_ins debe ser un array no vacío" });
    }

    const data = await fetchClientesByOrdInsBatch(ord_ins);
    return res.json(data);
  } catch (err) {
    console.error("getClientesByOrdInsBatch error:", err?.message);
    return res.status(500).json({ message: "Error interno" });
  }
}

module.exports = {
  buscarClientes,
  buscarClientesActivos,
  getAllDataArray,
  getDataArrayActivos,
  getAllDataMapa,
  getServicioByOrdIns,
  getAllInstPend,
  getClientesByOrdInsBatch,
};
