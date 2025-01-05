const {
  selectAllFuncionesAdmin,
  selectAllFuncionesBodega,
  selectAllFuncionesNoc,
} = require("../../models/sistema/funciones.models");

const getAllFunciones = async (req, res, next) => {
  try {
    const [admin] = await selectAllFuncionesAdmin();
    const [bodega] = await selectAllFuncionesBodega();
    const [noc] = await selectAllFuncionesNoc();
    const combinedResults = [
      { nombre: "Administrador", result: admin },
      { nombre: "Bodega", result: bodega },
      { nombre: "Noc", result: noc },
    ];

    res.json(combinedResults);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllFunciones };
