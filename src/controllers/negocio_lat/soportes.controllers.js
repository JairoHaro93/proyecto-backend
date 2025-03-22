const {
  selectAllSoportes,
  selectSoporteById,
  insertSoporte,
  selectAllSoportesPendientes,
  selectSoporteByOrdIns,
  aceptarSoporteByOrdIns,
  selectSoportesByNoc,
  updateAsignarSolucion,
  updateAsignarTecnico,
  selectAllSoportesParaTec,
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
  const { soporteId } = req.params;
  try {
    const soporte = await selectSoporteById(soporteId);
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

//CONTROLADOR PARA OBTENER TODOS LOS SOPORTES VISITA Y LOS
const getAllSoportesParaTec = async (req, res, next) => {
  try {
    const [result] = await selectAllSoportesParaTec();
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
    // Inserta el nuevo usuario
    const [result] = await insertSoporte(req.body);

    // Recupera el soporte insertado
    const soporte = await selectSoporteById(result.insertId);

    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA QUE NOC ACPETE EL SOPORTE
const aceptarSoporte = async (req, res, next) => {
  const { soporteOrdIns } = req.params;

  try {
    await aceptarSoporteByOrdIns(soporteOrdIns, req.body);
    const soporte = await selectSoporteByOrdIns(soporteOrdIns);
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA QUE NOC ASIGNE UNA SOLUCION
const asignarSolucion = async (req, res, next) => {
  const { soporteOrdIns } = req.params;

  try {
    await updateAsignarSolucion(soporteOrdIns, req.body);
    const soporte = await selectSoporteByOrdIns(soporteOrdIns);
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA QUE NOC ASIGNE UNA SOLUCION
const asignarTecnico = async (req, res, next) => {
  const { soporteOrdIns } = req.params;

  try {
    await updateAsignarTecnico(soporteOrdIns, req.body);
    const soporte = await selectSoporteByOrdIns(soporteOrdIns);
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA OBTENER TODOS LOS SOPORTES DE NOC
const getAllSoportesByNoc = async (req, res, next) => {
  const { noc_id } = req.params;
  try {
    const soporte = await selectSoportesByNoc(noc_id);

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
  getAllSoportesParaTec,
  asignarTecnico,
  getAllSoportesPendientes,
  createSoporte,
  aceptarSoporte,
  getAllSoportesByNoc,
};
