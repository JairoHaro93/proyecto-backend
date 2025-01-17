const {
  selectAllFunciones,
  selectFuncionesById,
} = require("../../models/sistema/funciones.models");

const getAllFunciones = async (req, res, next) => {
  try {
    const [result] = await selectAllFunciones();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getFuncionesById = async (req, res, next) => {
  const { usuarioId } = req.params;

  try {
    const [result] = await selectFuncionesById(usuarioId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllFunciones, getFuncionesById };
