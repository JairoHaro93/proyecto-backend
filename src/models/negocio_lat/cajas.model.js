// models/negocio_lat/cajas.model.js
const { poolmysql } = require("../../config/db");

function insertCaja({
  caja_tipo,
  caja_nombre,
  caja_estado = "DISEÑO",
  caja_hilo,
  caja_coordenadas,
}) {
  return poolmysql.query(
    `
    INSERT INTO neg_t_cajas (
      caja_estado,
      caja_nombre,
      caja_tipo,
      caja_hilo,
      caja_coordenadas
    ) VALUES (?, ?, ?, ?, ?);
    `,
    [caja_estado, caja_nombre, caja_tipo, caja_hilo, caja_coordenadas]
  );
}

module.exports = { insertCaja };
