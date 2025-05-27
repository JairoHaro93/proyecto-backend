const {
  selectAllDataMapa,

  selectAllDataBasicos,
  selectAllDataArrayByCed,
  selectDataArrayActivosByCed,
  selectDataBasicosActivos,
  selectByOrdnIns,
  selectAllInstPend,
} = require("../../models/negocio/info_clientes.models");

//CONTROLADOR PARA OBTENER LOS NOMBRES Y CEDULA
const getAllDataBasicos = async (req, res, next) => {
  try {
    const result = await selectAllDataBasicos();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER LOS NOMBRES Y CEDULA CON SERVICIOS ACTIVOS
const getDataBasicosActivos = async (req, res, next) => {
  try {
    const result = await selectDataBasicosActivos();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

// CONTROLADOR PARA OBTENER todos los datos en array
const getAllDataArray = async (req, res, next) => {
  const { cedula } = req.params; // ✅ primero declaras

  try {
    const result = await selectAllDataArrayByCed(cedula); // luego usas

    if (!result) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Error en getAllDataArray:", error.message);
    next(error);
  }
};

// CONTROLADOR PARA OBTENER los clientes con servicios activos
const getDataArrayActivos = async (req, res, next) => {
  const { cedula } = req.params; // ✅ primero declaras

  try {
    const result = await selectDataArrayActivosByCed(cedula); // luego usas

    if (!result) {
      return res.status(404).json({ message: "Cliente no encontrado." });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Error en getAllDataArray:", error.message);
    next(error);
  }
};

//CONTROLADOR PARA OBTENER LOS DATOS DE TODOS LOS CLIENTES PARA MOSTRARLOS EN EL MAPA
const getAllDataMapa = async (req, res, next) => {
  try {
    const result = await selectAllDataMapa();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};

//CONTROLADOR PARA OBTENER UN SOPORTE POR ORDINS
const getServicioByOrdIns = async (req, res, next) => {
  const { servicioOrdIns } = req.params;
  try {
    //const soporte = await selectServiceByOrdIns(servicioOrdIns);
    const soporte = await selectByOrdnIns(servicioOrdIns);

    if (!soporte) {
      return res
        .status(404)
        .json({ message: "La orden de instalacion del servicio no existe." });
    }
    res.json(soporte);
  } catch (error) {
    next(error);
  }
};


//CONTROLADOR PARA OBTENER UN SOPORTE POR ORDINS

const getAllInstPend  = async (req, res, next) => {
  try {
    const result = await selectAllInstPend();
    res.json(result); // Enviar la respuesta con el JSON estructurado
  } catch (error) {
    next(error);
  }
};


module.exports = {
  getAllDataBasicos,
  getDataBasicosActivos,
  getAllDataArray,
  getDataArrayActivos,
  getAllDataMapa,
  getServicioByOrdIns,
  getAllInstPend
};
