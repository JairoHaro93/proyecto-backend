const bcrypt = require("bcryptjs");
const {
  selectAllUsuarios,
  insertUsuario,
  selectUsuarioById,
  updateUsuarioById,
  deleteUsuario,
} = require("../models/usuarios.models");

const getAllUsuarios = async (req, res, next) => {
  try {
    const [result] = await selectAllUsuarios();
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getUsuarioById = async (req, res, next) => {
  const { usuarioId } = req.params;
  try {
    const usuario = await selectUsuarioById(usuarioId);
    if (!usuario) {
      return res.status(404).json({ message: "El id  de usuario no existe" });
    }
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const createUsuario = async (req, res, next) => {
  req.body.password = await bcrypt.hash(req.body.password, 8);

  try {
    //Inserta el nuevo cliente
    const [result] = await insertUsuario(req.body);
    //Recupera el clienete insertado
    const usuario = await selectUsuarioById(result.insertId);
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const updateUsuario = async (req, res, next) => {
  const { usuarioId } = req.params;
  try {
    req.body.password = await bcrypt.hash(req.body.password, 8);

    await updateUsuarioById(usuarioId, req.body);
    const usuario = await selectUsuarioById(usuarioId);
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const deleteByID = async (req, res, next) => {
  const { usuarioId } = req.params;
  const usuario = await selectUsuarioById(usuarioId);
  res.json(usuario);
  await deleteUsuario(usuarioId);
  try {
  } catch (error) {
    next(error);
  }
};

//
module.exports = {
  getAllUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  deleteByID,
};
