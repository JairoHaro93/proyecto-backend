const { connectDB, sql } = require("../../config/db");

let pool;

// Función para inicializar la conexión
async function initDB() {
  if (!pool) {
    pool = await connectDB(); // Espera la conexión
  }
}

// QUERY PARA OBTENER LOS DATOS BASICOS DE TODOS LOS CLIENTES
async function selectAllBasicInfoClientes() {
  await initDB(); // Asegurar que `pool` está inicializado antes de usarlo
  try {
    const result = await pool.request().query(`
      SELECT 
        c.cli_cedula AS cedula,
        CONCAT(COALESCE(c.cli_nombres, ''), ' ', COALESCE(c.cli_apellidos, '')) AS nombre_completo,
        CONCAT(COALESCE(o.ord_ins_coordenadas_x, ''), ', ', COALESCE(o.ord_ins_coordenadas_y, '')) AS coordenadas,
        o.ord_ins_ip_equipo_final AS ip,
        o.ord_ins_direccion AS direccion,
        o.ord_ins_referencia_direccion AS referencia,
        o.ord_ins_id AS orden_instalacion,
        o.ord_ins_fecha_instalacion AS fecha_instalacion,
        o.ord_ins_telefonos AS telefonos,
        CASE 
          WHEN e.est_pag_fac_int_nombre = 'CANCELADO' THEN 'PAGADO'
          ELSE e.est_pag_fac_int_nombre
        END AS estado,
        CONCAT(COALESCE(emp.emp_nombres, ''), ' ', COALESCE(emp.emp_apellidos, '')) AS instalado_por,
        pi.pla_int_nombre AS plan_nombre,
        pi.pla_int_precio AS precio
      FROM t_Clientes c
      JOIN t_Ordenes_Instalaciones o ON c.cli_cedula = o.cli_cedula
      JOIN t_Sucursales s ON o.suc_id = s.suc_id
      JOIN t_Pagos_Mensual_Internet p ON o.ord_ins_id = p.ord_ins_id
      JOIN t_Estado_Pago_Factura_Internet e ON p.est_pag_fac_int = e.est_pag_fac_int_id
      JOIN t_Empleados emp ON o.emp_id = emp.emp_id
      JOIN t_Planes_Internet pi ON o.pla_int_id = pi.pla_int_id
      WHERE o.est_ser_int_id <> 10
        AND s.suc_nombre = 'LATACUNGA'
        AND p.ani_mes_id = 86
      ORDER BY nombre_completo;
    `);

    const rows = result.recordset;

    // Estructurar la respuesta agrupando por cédula y nombre
    const groupedData = rows.reduce((acc, row) => {
      const {
        cedula,
        nombre_completo,
        coordenadas,
        ip,
        direccion,
        referencia,
        orden_instalacion,
        fecha_instalacion,
        estado,
        instalado_por,
        plan_nombre,
        telefonos,
        precio,
      } = row;

      // Buscar si ya existe el cliente en el acumulador
      let cliente = acc.find((c) => c.cedula === cedula);

      if (!cliente) {
        // Si no existe, se agrega con un array de servicios
        cliente = { cedula, nombre_completo, servicios: [] };
        acc.push(cliente);
      }

      // Agregar el servicio (incluyendo estado, instalado_por y el plan) al array del cliente
      cliente.servicios.push({
        coordenadas,
        ip,
        direccion,
        referencia,
        orden_instalacion,
        fecha_instalacion,
        estado,
        instalado_por,
        plan_nombre,
        telefonos,
        precio,
      });

      return acc;
    }, []);

    return groupedData;
  } catch (error) {
    console.error("❌ Error en la consulta SQL:", error.message);
    throw error;
  }
}

// QUERY PARA OBTENER LOS DATOS DE TODOS LOS CLIENTES PARA MOSTRARLO EN MAPA
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

//  QUERY PARA OBTENER LOS DATOS DE LA INSTALACION POR EL ORDINS
async function selectServiceByOrdIns(servicioOrdIns) {
  await initDB(); // Asegurar que `pool` está inicializado antes de usarlo
  try {
    const result = await pool.request().input("servicioOrdIns", servicioOrdIns) // Pasar el parámetro correctamente
      .query(`
        SELECT 
          c.cli_cedula AS cedula,
          CONCAT(COALESCE(c.cli_nombres, ''), ' ', COALESCE(c.cli_apellidos, '')) AS nombre_completo,
          CONCAT(COALESCE(o.ord_ins_coordenadas_x, ''), ', ', COALESCE(o.ord_ins_coordenadas_y, '')) AS coordenadas,
          o.ord_ins_ip_equipo_final AS ip,
          o.ord_ins_direccion AS direccion,
          o.ord_ins_referencia_direccion AS referencia,
          o.ord_ins_id AS orden_instalacion,
          o.ord_ins_fecha_instalacion AS fecha_instalacion,
          o.ord_ins_telefonos AS telefonos,
          CASE 
            WHEN e.est_pag_fac_int_nombre = 'CANCELADO' THEN 'PAGADO'
            ELSE e.est_pag_fac_int_nombre
          END AS estado,
          CONCAT(COALESCE(emp.emp_nombres, ''), ' ', COALESCE(emp.emp_apellidos, '')) AS instalado_por,
          pi.pla_int_nombre AS plan_nombre,
          pi.pla_int_precio AS precio
        FROM t_Clientes c
        JOIN t_Ordenes_Instalaciones o ON c.cli_cedula = o.cli_cedula
        JOIN t_Sucursales s ON o.suc_id = s.suc_id
        JOIN t_Pagos_Mensual_Internet p ON o.ord_ins_id = p.ord_ins_id
        JOIN t_Estado_Pago_Factura_Internet e ON p.est_pag_fac_int = e.est_pag_fac_int_id
        JOIN t_Empleados emp ON o.emp_id = emp.emp_id
        JOIN t_Planes_Internet pi ON o.pla_int_id = pi.pla_int_id
        WHERE o.est_ser_int_id <> 10
          AND s.suc_nombre = 'LATACUNGA'
          AND p.ani_mes_id = 86
          AND o.ord_ins_id = @servicioOrdIns
      `);

    if (result.recordset.length === 0) {
      return null; // Si no hay resultados, devolver null
    }

    const servicio = result.recordset[0]; // Solo debería haber un servicio

    // Construir el objeto de servicio
    return {
      cedula: servicio.cedula,
      nombre_completo: servicio.nombre_completo,
      coordenadas: servicio.coordenadas,
      ip: servicio.ip,
      direccion: servicio.direccion,
      referencia: servicio.referencia,
      orden_instalacion: servicio.orden_instalacion,
      fecha_instalacion: servicio.fecha_instalacion,
      telefonos: servicio.telefonos,
      estado: servicio.estado,
      instalado_por: servicio.instalado_por,
      plan_nombre: servicio.plan_nombre,
      precio: servicio.precio,
    };
  } catch (error) {
    console.error("❌ Error en la consulta SQL:", error.message);
    throw error;
  }
}

module.exports = {
  selectAllBasicInfoClientes,
  selectAllDataMapa,
  selectServiceByOrdIns,
};
