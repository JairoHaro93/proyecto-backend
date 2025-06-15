const {
  selectAllSoportes,
  selectSoporteById,
  insertSoporte,
  selectAllSoportesPendientes,
  selectSoporteByOrdIns,
  aceptarSoporteById,
  selectSoportesByNoc,
  updateAsignarSolucion,
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
    const soporteActivo = soportes.find((s) => s.reg_sop_estado !== "RESUELTO");
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
const asignarSolucion = async (req, res, next) => {
  const { id_sop } = req.params;

  try {
    await updateAsignarSolucion(id_sop, req.body);
    const soporte = await selectSoporteById(id_sop);
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA OBTENER TODOS LOS SOPORTES DE NOC
const getAllSoportesByNoc = async (req, res, next) => {
  const { id_noc } = req.params;
  try {
    const soporte = await selectSoportesByNoc(id_noc);

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

  getAllSoportesPendientes,
  createSoporte,
  aceptarSoporte,
  getAllSoportesByNoc,
};
