const { connectDB, sql } = require("../../config/db");

let pool;

// Función para inicializar la conexión
async function initDB() {
  if (!pool) {
    pool = await connectDB(); // Espera la conexión
  }
}

// Función para hacer la consulta
async function selectAllPrueba() {
  await initDB(); // Asegurar que `pool` está inicializado antes de usarlo
  try {
    const result = await pool.request().query(`

SELECT 
    CONCAT(COALESCE(c.cli_nombres, ''), ' ', COALESCE(c.cli_apellidos, '')) AS nombre_completo,
    CONCAT(COALESCE(o.ord_ins_coordenadas_x, ''), ', ', COALESCE(o.ord_ins_coordenadas_y, '')) AS coordenadas,
    o.ord_ins_ip_equipo_final AS ip,
    o.ord_ins_id AS orden_instalacion,
    ord_ins_valor_deuda_total AS deuda,
    ord_ins_valor_deuda_meses AS meses_deuda,
    t.tip_enl_nombre_1 AS enlace

FROM t_Clientes c
JOIN t_Ordenes_Instalaciones o ON c.cli_cedula = o.cli_cedula
JOIN t_Sucursales s ON o.suc_id = s.suc_id
JOIN t_Planes_Internet p ON o.pla_int_id = p.pla_int_id
JOIN t_Tipos_Enlace t ON p.tip_enl_id = t.tip_enl_id
WHERE o.est_ser_int_id <> 10
AND s.suc_nombre = 'LATACUNGA'
ORDER BY nombre_completo ASC;




`);
    return result.recordset; // Retorna solo los resultados
  } catch (error) {
    console.error("❌ Error en la consulta SQL:", error.message);
    throw error;
  }
}

module.exports = {
  selectAllPrueba,
};
