const { selectAllPrueba } = require("../../models/negocio/prueba.models");

const getAllPrueba = async (req, res, next) => {
  try {
    const result = await selectAllPrueba();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllPrueba };
