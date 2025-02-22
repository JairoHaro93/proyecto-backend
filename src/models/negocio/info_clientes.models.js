const { connectDB, sql } = require("../../config/db");

let pool;

// Función para inicializar la conexión
async function initDB() {
  if (!pool) {
    pool = await connectDB(); // Espera la conexión
  }
}

// Función para hacer la consulta y estructurar los datos en JSON anidado
async function selectAllDataClientes() {
  await initDB(); // Asegurar que `pool` está inicializado antes de usarlo
  try {
    const result = await pool.request().query(`
      SELECT 
          c.cli_cedula AS cedula,
          CONCAT(COALESCE(c.cli_nombres, ''), ' ', COALESCE(c.cli_apellidos, '')) AS nombre_completo,
          CONCAT(COALESCE(o.ord_ins_coordenadas_x, ''), ', ', COALESCE(o.ord_ins_coordenadas_y, '')) AS coordenadas,
          o.ord_ins_ip_equipo_final AS ip,
          o.ord_ins_id AS orden_instalacion,
          COALESCE(o.ord_ins_valor_deuda_total, 0) AS deuda,
          COALESCE(o.ord_ins_valor_deuda_meses, 0) AS meses_deuda,
          t.tip_enl_nombre_1 AS enlace
      FROM t_Clientes c
      JOIN t_Ordenes_Instalaciones o ON c.cli_cedula = o.cli_cedula
      JOIN t_Sucursales s ON o.suc_id = s.suc_id
      JOIN t_Planes_Internet p ON o.pla_int_id = p.pla_int_id
      JOIN t_Tipos_Enlace t ON p.tip_enl_id = t.tip_enl_id
      WHERE o.est_ser_int_id <> 10
      AND s.suc_nombre = 'LATACUNGA'
      ORDER BY  nombre_completo;
    `);

    const rows = result.recordset;

    // Estructurar la respuesta agrupando por cédula y nombre
    const groupedData = rows.reduce((acc, row) => {
      const {
        cedula,
        nombre_completo,
        coordenadas,
        ip,
        orden_instalacion,
        deuda,
        meses_deuda,
        enlace,
      } = row;

      // Buscar si ya existe el cliente en el acumulador
      let cliente = acc.find((c) => c.cedula === cedula);

      if (!cliente) {
        // Si no existe, lo agregamos con un array de servicios
        cliente = { cedula, nombre_completo, servicios: [] };
        acc.push(cliente);
      }

      // Agregar el servicio al array del cliente
      cliente.servicios.push({
        coordenadas,
        ip,
        orden_instalacion,
        deuda: deuda ?? 0, // Asegurar que null se convierta en 0
        meses_deuda: meses_deuda ?? 0, // Asegurar que null se convierta en 0
        enlace,
      });

      return acc;
    }, []);

    return groupedData;
  } catch (error) {
    console.error("❌ Error en la consulta SQL:", error.message);
    throw error;
  }
}

// Función para hacer la consulta y estructurar los datos en JSON anidado
async function selectAllDataMapa() {
  await initDB(); // Asegurar que `pool` está inicializado antes de usarlo
  try {
    const result = await pool.request().query(`
      SELECT 
          c.cli_cedula AS cedula,
          CONCAT(COALESCE(c.cli_nombres, ''), ' ', COALESCE(c.cli_apellidos, '')) AS nombre_completo,
          CONCAT(COALESCE(o.ord_ins_coordenadas_x, ''), ', ', COALESCE(o.ord_ins_coordenadas_y, '')) AS coordenadas,
          o.ord_ins_ip_equipo_final AS ip,
          o.ord_ins_id AS orden_instalacion,
          COALESCE(o.ord_ins_valor_deuda_total, 0) AS deuda,
          COALESCE(o.ord_ins_valor_deuda_meses, 0) AS meses_deuda,
          t.tip_enl_nombre_1 AS enlace
      FROM t_Clientes c
      JOIN t_Ordenes_Instalaciones o ON c.cli_cedula = o.cli_cedula
      JOIN t_Sucursales s ON o.suc_id = s.suc_id
      JOIN t_Planes_Internet p ON o.pla_int_id = p.pla_int_id
      JOIN t_Tipos_Enlace t ON p.tip_enl_id = t.tip_enl_id
      WHERE o.est_ser_int_id <> 10
      AND s.suc_nombre = 'LATACUNGA'
      ORDER BY c.cli_cedula, nombre_completo;
    `);

    const rows = result.recordset;

    // Estructurar la respuesta agrupando por cédula y nombre
    const groupedData = rows.reduce((acc, row) => {
      const {
        cedula,
        nombre_completo,
        coordenadas,
        ip,
        orden_instalacion,
        deuda,
        meses_deuda,
        enlace,
      } = row;

      // Buscar si ya existe el cliente en el acumulador
      let cliente = acc.find((c) => c.cedula === cedula);

      if (!cliente) {
        // Si no existe, lo agregamos con un array de servicios
        cliente = { cedula, nombre_completo, servicios: [] };
        acc.push(cliente);
      }

      // Agregar el servicio al array del cliente
      cliente.servicios.push({
        coordenadas,
        ip,
        orden_instalacion,
        deuda: deuda ?? 0, // Asegurar que null se convierta en 0
        meses_deuda: meses_deuda ?? 0, // Asegurar que null se convierta en 0
        enlace,
      });

      return acc;
    }, []);

    return groupedData;
  } catch (error) {
    console.error("❌ Error en la consulta SQL:", error.message);
    throw error;
  }
}

module.exports = {
  selectAllDataClientes,
  selectAllDataMapa,
};
