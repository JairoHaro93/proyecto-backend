const {
  selectAllDataClientes,
  selectAllDataMapa,
} = require("../../models/negocio/info_clientes.models");

const getAllDataClientes = async (req, res, next) => {
  try {
    const result = await selectAllDataClientes();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

const getAllDataMapa = async (req, res, next) => {
  try {
    const result = await selectAllDataMapa();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllDataClientes, getAllDataMapa };
