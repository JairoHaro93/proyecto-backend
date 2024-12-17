const { selectAllUsuarios } = require("../models/usuarios.models");

const getAllUsuarios = async (req, res, next) => {
  try {
    const [result] = await selectAllUsuarios();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAllUsuarios };
