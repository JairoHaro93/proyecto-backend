const { poolmysql } = require("../../config/db");

// QUERY PARA OBTENER UN VISITA POR ID
async function selectVisById(id_vis) {
  const [soportes] = await poolmysql.query(
    `
    SELECT 
      vis.id,
      vis.ord_ins,
      vis.vis_estado,
      vis.vis_diagnostico,
      vis.vis_coment_cliente,
      vis.vis_tipo

    FROM
      neg_t_vis AS vis
    WHERE  
      vis.id = ?;
    `,
    [id_vis]
  );

  return soportes.length > 0 ? soportes[0] : null;
}

// QUERY PARA OBTENER TODOS VISITA DE UNA ORDEN
async function selectVisByOrdIns(ord_ins) {
  const [soportes] = await poolmysql.query(
    `
    SELECT 
      vis.id,
      vis.ord_ins,
      vis.vis_tipo,
      vis.vis_estado,
      vis.vis_coment_cliente,
      vis.vis_diagnostico,
      vis.vis_solucion,
      vis.img_1,
      vis.img_2,
      vis.img_3,
      vis.img_4,
      vis.fecha_actualizacion
    FROM
      neg_t_vis AS vis
    WHERE  
      vis.ord_ins = ?
    ORDER BY vis.id DESC;
    `,
    [ord_ins]
  );

  return soportes;
}

// INSERTAR NUEVO REGISTRO VISITA
function insertVis({
  ord_ins,
  vis_estado = "PENDIENTE",
  vis_diagnostico,
  vis_coment_cliente,
  vis_tipo,
}) {
  return poolmysql.query(
    `
    INSERT INTO neg_t_vis (
      ord_ins,
      vis_estado,
      vis_diagnostico,
      vis_coment_cliente,
      vis_tipo
    ) VALUES (?, ?, ?, ?,?);
    `,
    [ord_ins, vis_estado, vis_diagnostico, vis_coment_cliente, vis_tipo]
  );
}

// ACTUALIZA EL ESTADO DE UN VISITA POR ID
function updateVisEstadoById(id_vis, vis_estado, vis_solucion) {
  return poolmysql.query(
    "UPDATE neg_t_vis SET vis_estado = ?, vis_solucion = ? WHERE id = ?",
    [vis_estado, vis_solucion, id_vis]
  );
}

module.exports = {
  selectVisById,
  selectVisByOrdIns,
  insertVis,
  updateVisEstadoById,
};
