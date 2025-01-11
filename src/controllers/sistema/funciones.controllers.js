const { selectAllFunciones } = require("../../models/sistema/funciones.models");

const getAllFunciones = async (req, res, next) => {
  try {
    const [result] = await selectAllFunciones();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllFunciones };
