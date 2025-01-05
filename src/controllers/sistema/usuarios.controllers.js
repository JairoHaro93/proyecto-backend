const bcrypt = require("bcryptjs");
const {
  selectAllUsuarios,
  insertUsuario,
  selectUsuarioById,
  updateUsuarioById,
  deleteUsuario,
} = require("../../models/sistema/usuarios.models");
const {
  insertFuncionesAdmin,
  insertFuncionesBod,
  insertFuncionesNoc,
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

    //Insertar las funciones permitidas
    if (req.body.rol) {
      const groupByRol = (items) => {
        return items.reduce((acc, item) => {
          // Si el rol no existe en el acumulador, inicialízalo como un array vacío
          if (!acc[item.rol]) {
            acc[item.rol] = [];
          }
          // Agrega la función al array correspondiente al rol
          acc[item.rol].push(item.funcion);
          return acc;
        }, {});
      };

      const resulta = groupByRol(req.body.rol);

      //insercion en cada tabla
      if (resulta.Administrador) {
        insertFuncionesAdmin(result.insertId, resulta.Administrador);
      }
      if (resulta.Bodega) {
        insertFuncionesBod(result.insertId, resulta.Bodega);
      }

      if (resulta.Noc) {
        insertFuncionesNoc(result.insertId, resulta.Noc);
      }
    }

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
