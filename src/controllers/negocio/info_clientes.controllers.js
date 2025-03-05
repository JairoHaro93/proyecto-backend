const {
  selectAllBasicInfoClientes,
  selectAllDataMapa,
  selectServiceByOrdIns,
} = require("../../models/negocio/info_clientes.models");

//CONTROLADOR PARA OBTENER LOS DATOS BASICOS DE TODOS LOS CLIENTES
const getAllDataClientes = async (req, res, next) => {
  try {
    const result = await selectAllBasicInfoClientes();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER LOS DATOS DE TODOS LOS CLIENTES PARA MOSTRARLOS EN EL MAPA
const getAllDataMapa = async (req, res, next) => {
  try {
    const result = await selectAllDataMapa();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER UN SOPORTE POR ORDINS
const getServicioByOrdIns = async (req, res, next) => {
  const { servicioOrdIns } = req.params;
  try {
    const soporte = await selectServiceByOrdIns(servicioOrdIns);
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

module.exports = { getAllDataClientes, getAllDataMapa, getServicioByOrdIns };
