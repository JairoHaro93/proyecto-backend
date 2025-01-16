const bcrypt = require("bcryptjs");
const {
  selectAllUsuarios,
  insertUsuario,
  selectUsuarioById,
  updateUsuarioById,
  deleteUsuario,
} = require("../../models/sistema/usuarios.models");
const {
  insertFunciones,
  deleteFunciones,
} = require("../../models/sistema/funciones.models");

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

    await insertFunciones(result.insertId, req.body.rol);

    //Recupera el clienete insertado
    const usuario = await selectUsuarioById(result.insertId);

    res.json(usuario);

    console.log(`Usuario ${usuario.nombre} Creado!!`);
  } catch (error) {
    next(error);
  }
};

const updateUsuario = async (req, res, next) => {
  const { usuarioId } = req.params;

  try {
    req.body.password = await bcrypt.hash(req.body.password, 8);

    await updateUsuarioById(usuarioId, req.body);

    await deleteFunciones(usuarioId);

    await insertFunciones(usuarioId, req.body.rol);

    const usuario = await selectUsuarioById(usuarioId);

    console.log(`Usuario ${usuario.nombre} ${usuario.apellido}  Actualizado!!`);
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const deleteByID = async (req, res, next) => {
  const { usuarioId } = req.params;
  const usuario = await selectUsuarioById(usuarioId);
  res.json(usuario);
  console.log(`Usuario ${usuario.nombre} Eliminado!!`);
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
