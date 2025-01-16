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
      return res.status(404).json({ message: "El ID de usuario no existe." });
    }
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const createUsuario = async (req, res, next) => {
  try {
    req.body.password = await bcrypt.hash(req.body.password, 8);

    // Inserta el nuevo usuario
    const [result] = await insertUsuario(req.body);

    if (Array.isArray(req.body.rol) && req.body.rol.length > 0) {
      await insertFunciones(result.insertId, req.body.rol);
    }

    // Recupera el usuario insertado
    const usuario = await selectUsuarioById(result.insertId);

    console.log(`Usuario ${usuario.nombre} creado con éxito.`);
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const updateUsuario = async (req, res, next) => {
  const { usuarioId } = req.params;

  try {
    if (req.body.password) {
      req.body.password = await bcrypt.hash(req.body.password, 8);
    }

    await updateUsuarioById(usuarioId, req.body);

    if (Array.isArray(req.body.rol) && req.body.rol.length > 0) {
      console.log("Actualizando funciones...");
      await deleteFunciones(usuarioId);
      await insertFunciones(usuarioId, req.body.rol);
    }

    const usuario = await selectUsuarioById(usuarioId);

    console.log(
      `Usuario ${usuario.nombre} ${usuario.apellido} actualizado con éxito.`
    );
    res.json(usuario);
  } catch (error) {
    next(error);
  }
};

const deleteByID = async (req, res, next) => {
  const { usuarioId } = req.params;
  try {
    const usuario = await selectUsuarioById(usuarioId);

    if (!usuario) {
      return res.status(404).json({ message: "El ID de usuario no existe." });
    }

    await deleteUsuario(usuarioId);

    console.log(`Usuario ${usuario.nombre} eliminado con éxito.`);
    res.json({ message: `Usuario ${usuario.nombre} eliminado con éxito.` });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  deleteByID,
};
