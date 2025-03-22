const { poolsql, sql } = require("../../config/db");

// ✅ QUERY PARA OBTENER LOS DATOS BÁSICOS DE TODOS LOS CLIENTES
async function selectAllBasicInfoClientes() {
  try {
    const pool = await poolsql;

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

    const groupedData = result.recordset.reduce((acc, row) => {
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

      let cliente = acc.find((c) => c.cedula === cedula);
      if (!cliente) {
        cliente = { cedula, nombre_completo, servicios: [] };
        acc.push(cliente);
      }

      cliente.servicios.push({
        coordenadas: coordenadas.trim(),
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
    console.error("❌ Error en selectAllBasicInfoClientes:", error.message);
    throw error;
  }
}

// ✅ QUERY PARA DATOS EN EL MAPA
async function selectAllDataMapa() {
  try {
    const pool = await poolsql;

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

    const groupedData = result.recordset.reduce((acc, row) => {
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

      let cliente = acc.find((c) => c.cedula === cedula);
      if (!cliente) {
        cliente = { cedula, nombre_completo, servicios: [] };
        acc.push(cliente);
      }

      cliente.servicios.push({
        coordenadas: coordenadas.trim(),
        ip,
        orden_instalacion,
        deuda,
        meses_deuda,
        enlace,
      });

      return acc;
    }, []);

    return groupedData;
  } catch (error) {
    console.error("❌ Error en selectAllDataMapa:", error.message);
    throw error;
  }
}

// ✅ QUERY POR ORD_INS
async function selectServiceByOrdIns(servicioOrdIns) {
  try {
    const pool = await poolsql;

    const result = await pool.request().input("servicioOrdIns", servicioOrdIns)
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

    if (result.recordset.length === 0) return null;

    const s = result.recordset[0];
    return {
      cedula: s.cedula,
      nombre_completo: s.nombre_completo,
      coordenadas: s.coordenadas.trim(),
      ip: s.ip,
      direccion: s.direccion,
      referencia: s.referencia,
      orden_instalacion: s.orden_instalacion,
      fecha_instalacion: s.fecha_instalacion,
      telefonos: s.telefonos,
      estado: s.estado,
      instalado_por: s.instalado_por,
      plan_nombre: s.plan_nombre,
      precio: s.precio,
    };
  } catch (error) {
    console.error("❌ Error en selectServiceByOrdIns:", error.message);
    throw error;
  }
}

module.exports = {
  selectAllBasicInfoClientes,
  selectAllDataMapa,
  selectServiceByOrdIns,
};
