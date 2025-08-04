const { poolmysql } = require("../../config/db");

// INSERTAR UNA NUEVA INSTALACIÓN
function insertInstalacion({ ord_ins, telefonos, coordenadas, observacion }) {
  return poolmysql.query(
    `INSERT INTO neg_t_instalaciones (
      ord_ins,
      inst_telefonos,
      inst_coordenadas,
      inst_observacion
    ) VALUES (?, ?, ?, ?)`,
    [ord_ins, telefonos, coordenadas, observacion]
  );
}

// VERIFICAR SI YA EXISTE INSTALACIÓN ACTIVA PARA ORDEN
function selectInstalacionesByOrdIns(ord_ins) {
  return poolmysql.query(
    `SELECT * FROM neg_t_instalaciones WHERE ord_ins = ?`,
    [ord_ins]
  );
}

module.exports = {
  insertInstalacion,
  selectInstalacionesByOrdIns,
};
