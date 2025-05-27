const { poolsql } = require("../../config/db");
const sql = require("mssql");

// ✅ QUERY PARA OBTENER LOS DATOS NOMBRES Y APELLIDOS DE TODOS LOS CLIENTES REGISTRADOS EN LATACUNGA
async function selectAllDataBasicos() {
  try {
    const pool = await poolsql.catch((err) => {
      console.error("❌ Error al conectar al pool:", err.message);
      throw new Error("Error de base de datos");
    });

    const result = await pool.request().query(`
      SELECT 
        c.cli_cedula AS cedula,
        CONCAT(c.cli_nombres, ' ', c.cli_apellidos) AS nombre_completo
      FROM 
        t_Clientes c
        JOIN t_Ordenes_Instalaciones o ON c.cli_cedula = o.cli_cedula
        JOIN t_Sucursales s ON o.suc_id = s.suc_id
      WHERE 
        s.suc_nombre = 'LATACUNGA'
      GROUP BY 
        c.cli_cedula, c.cli_nombres, c.cli_apellidos
        
      ORDER BY 
        nombre_completo;
    `);

    return result.recordset;
  } catch (error) {
    console.error("❌ Error en selectAllDataBasicos:", error.message);
    throw error;
  }
}

// ✅ QUERY PARA OBTENER LOS DATOS NOMBRES Y APELLIDOS DE TODOS LOS CLIENTES REGISTRADOS EN LATACUNGA CON SERVICIOS ACTIVOS
async function selectDataBasicosActivos() {
  try {
    const pool = await poolsql.catch((err) => {
      console.error("❌ Error al conectar al pool:", err.message);
      throw new Error("Error de base de datos");
    });

    const result = await pool.request().query(`
      SELECT 
        c.cli_cedula AS cedula,
        CONCAT(c.cli_nombres, ' ', c.cli_apellidos) AS nombre_completo
      FROM 
        t_Clientes c
        JOIN t_Ordenes_Instalaciones o ON c.cli_cedula = o.cli_cedula
        JOIN t_Sucursales s ON o.suc_id = s.suc_id
      WHERE 
        s.suc_nombre = 'LATACUNGA'
        AND o.est_ser_int_id <> 10
      GROUP BY 
        c.cli_cedula, c.cli_nombres, c.cli_apellidos
      ORDER BY 
        nombre_completo;
    `);

    return result.recordset;
  } catch (error) {
    console.error("❌ Error en selectAllDataBasicos:", error.message);
    throw error;
  }
}

//OBTIENE TODOS LOS DATOS CON LOS SERVICIOS EN ARRAY ORDENADOS POR ELIMINADO
async function selectAllDataArrayByCed(cedulaParam) {
  try {
    const pool = await poolsql.catch((err) => {
      console.error("❌ Error al conectar al pool:", err.message);
      throw new Error("Error de base de datos");
    });

    const result = await pool
      .request()
      .input("cli_cedula", sql.VarChar, cedulaParam).query(`
        SELECT 
          ORDEN_CLIENTE.cli_cedula AS cedula,
          c.cli_nombres + ' ' + c.cli_apellidos AS nombre_completo,
          ORDEN_CLIENTE.ord_ins_id AS orden_instalacion,
          ORDEN_CLIENTE.ord_ins_fecha_instalacion AS fecha_instalacion,
          ORDEN_CLIENTE.ord_ins_direccion AS direccion,
          ORDEN_CLIENTE.ord_ins_referencia_direccion AS referencia,
          ORDEN_CLIENTE.ord_ins_ip_equipo_final AS ip,
          ORDEN_CLIENTE.ord_ins_telefonos AS telefonos,
          ORDEN_CLIENTE.ord_ins_coordenadas_x + ',' + ORDEN_CLIENTE.ord_ins_coordenadas_y AS coordenadas,
          IIF(ORDEN_CLIENTE.ord_ins_estado_sin_servicio = 'True', 'SI', 'NO') AS cortado,
          t_Estado_Ordenes_Instalaciones.est_ord_ins_nombre AS estado_instalacion,
          t_Estado_Servicio_Internet.est_ser_int_nombre AS servicio,
          ORDEN_CLIENTE.est_ser_int_id AS estado_servicio_id, -- 🔑 agregado para ordenar
          t_Servicios_Internet.ser_int_nombre AS tipo_instalacion,
          t_Forma_Servicio.for_ser_nombre AS tipo,
          t_Planes_Internet.pla_int_nombre AS plan_nombre,
          t_Planes_Internet.pla_int_precio AS precio,
          CASE 
            WHEN ORDEN_CLIENTE.ord_ins_fecha_pago IS NOT NULL THEN 'PAGADO'
            ELSE 'PENDIENTE'
          END AS estado,
          EMPLEADO_TECNICO.emp_nombres + ' ' + EMPLEADO_TECNICO.emp_apellidos AS instalado_por

        FROM 
          t_Ordenes_Instalaciones AS ORDEN_CLIENTE
          INNER JOIN t_Planes_Internet ON t_Planes_Internet.pla_int_id = ORDEN_CLIENTE.pla_int_id
          INNER JOIN t_Forma_Servicio ON t_Forma_Servicio.for_ser_id = ORDEN_CLIENTE.for_ser_id
          INNER JOIN t_Estado_Ordenes_Instalaciones ON t_Estado_Ordenes_Instalaciones.est_ord_ins_id = ORDEN_CLIENTE.est_ord_id
          INNER JOIN t_Estado_Servicio_Internet ON t_Estado_Servicio_Internet.est_ser_int_id = ORDEN_CLIENTE.est_ser_int_id
          INNER JOIN t_Servicios_Internet ON t_Servicios_Internet.ser_int_id = ORDEN_CLIENTE.ser_int_id
          LEFT JOIN t_Empleados AS EMPLEADO_TECNICO ON EMPLEADO_TECNICO.emp_id = ORDEN_CLIENTE.emp_id
          LEFT JOIN t_Clientes AS c ON c.cli_cedula = ORDEN_CLIENTE.cli_cedula

        WHERE 
          ORDEN_CLIENTE.cli_cedula = @cli_cedula
        ORDER BY 
          ORDEN_CLIENTE.ord_ins_fecha_instalacion DESC;
      `);

    const rows = result.recordset;

    if (rows.length === 0) return null;

    const { cedula, nombre_completo } = rows[0];
    const servicios = rows
      .map((row) => ({
        coordenadas: row.coordenadas?.trim() ?? "",
        ip: row.ip,
        direccion: row.direccion,
        referencia: row.referencia,
        orden_instalacion: row.orden_instalacion,
        fecha_instalacion: row.fecha_instalacion,
        telefonos: row.telefonos,
        estado: row.estado,
        instalado_por: row.instalado_por,
        plan_nombre: row.plan_nombre,
        precio: row.precio,
        servicio: row.servicio,
        estado_instalacion: row.estado_instalacion,
        tipo_instalacion: row.tipo_instalacion,
        tipo: row.tipo,
        cortado: row.cortado,
        estado_servicio_id: row.estado_servicio_id, // necesario para orden
      }))
      .sort((a, b) => b.estado_servicio_id - a.estado_servicio_id) // orden descendente
      .map(({ estado_servicio_id, ...rest }) => rest); // ❌ elimina ese campo del resultado

    return { cedula, nombre_completo, servicios };
  } catch (error) {
    console.error("❌ Error en selectAllDataArrayByCed:", error.message);
    throw error;
  }
}

//OBTIENE TODOS LOS DATOS CON LOS SERVICIOS ACTIVOS EN ARRAY ORDENADOS POR ANTIGUEDAD
async function selectDataArrayActivosByCed(cedulaParam) {
  try {
    const pool = await poolsql;

    const result = await pool
      .request()
      .input("cli_cedula", sql.VarChar, cedulaParam).query(`
        SELECT 
          ORDEN_CLIENTE.cli_cedula AS cedula,
          c.cli_nombres + ' ' + c.cli_apellidos AS nombre_completo,
          ORDEN_CLIENTE.ord_ins_id AS orden_instalacion,
          ORDEN_CLIENTE.ord_ins_fecha_instalacion AS fecha_instalacion,
          ORDEN_CLIENTE.ord_ins_direccion AS direccion,
          ORDEN_CLIENTE.ord_ins_referencia_direccion AS referencia,
          ORDEN_CLIENTE.ord_ins_ip_equipo_final AS ip,
          ORDEN_CLIENTE.ord_ins_telefonos AS telefonos,
          ORDEN_CLIENTE.ord_ins_coordenadas_x + ',' + ORDEN_CLIENTE.ord_ins_coordenadas_y AS coordenadas,
          IIF(ORDEN_CLIENTE.ord_ins_estado_sin_servicio = 'True', 'SI', 'NO') AS cortado,
          t_Estado_Ordenes_Instalaciones.est_ord_ins_nombre AS estado_instalacion,
          t_Estado_Servicio_Internet.est_ser_int_nombre AS servicio,
          ORDEN_CLIENTE.est_ser_int_id AS estado_servicio_id, -- 🔑 agregado para ordenar
          t_Servicios_Internet.ser_int_nombre AS tipo_instalacion,
          t_Forma_Servicio.for_ser_nombre AS tipo,
          t_Planes_Internet.pla_int_nombre AS plan_nombre,
          t_Planes_Internet.pla_int_precio AS precio,
          CASE 
            WHEN ORDEN_CLIENTE.ord_ins_fecha_pago IS NOT NULL THEN 'PAGADO'
            ELSE 'PENDIENTE'
          END AS estado,
          EMPLEADO_TECNICO.emp_nombres + ' ' + EMPLEADO_TECNICO.emp_apellidos AS instalado_por

        FROM 
          t_Ordenes_Instalaciones AS ORDEN_CLIENTE
          INNER JOIN t_Planes_Internet ON t_Planes_Internet.pla_int_id = ORDEN_CLIENTE.pla_int_id
          INNER JOIN t_Forma_Servicio ON t_Forma_Servicio.for_ser_id = ORDEN_CLIENTE.for_ser_id
          INNER JOIN t_Estado_Ordenes_Instalaciones ON t_Estado_Ordenes_Instalaciones.est_ord_ins_id = ORDEN_CLIENTE.est_ord_id
          INNER JOIN t_Estado_Servicio_Internet ON t_Estado_Servicio_Internet.est_ser_int_id = ORDEN_CLIENTE.est_ser_int_id
          INNER JOIN t_Servicios_Internet ON t_Servicios_Internet.ser_int_id = ORDEN_CLIENTE.ser_int_id
          LEFT JOIN t_Empleados AS EMPLEADO_TECNICO ON EMPLEADO_TECNICO.emp_id = ORDEN_CLIENTE.emp_id
          LEFT JOIN t_Clientes AS c ON c.cli_cedula = ORDEN_CLIENTE.cli_cedula

        WHERE ORDEN_CLIENTE.est_ser_int_id <> 10
         AND ORDEN_CLIENTE.cli_cedula = @cli_cedula
        ORDER BY 
          ORDEN_CLIENTE.ord_ins_fecha_instalacion DESC;
      `);

    const rows = result.recordset;

    if (rows.length === 0) return null;

    const { cedula, nombre_completo } = rows[0];
    const servicios = rows
      .map((row) => ({
        coordenadas: row.coordenadas?.trim() ?? "",
        ip: row.ip,
        direccion: row.direccion,
        referencia: row.referencia,
        orden_instalacion: row.orden_instalacion,
        fecha_instalacion: row.fecha_instalacion,
        telefonos: row.telefonos,
        estado: row.estado,
        instalado_por: row.instalado_por,
        plan_nombre: row.plan_nombre,
        precio: row.precio,
        servicio: row.servicio,
        estado_instalacion: row.estado_instalacion,
        tipo_instalacion: row.tipo_instalacion,
        tipo: row.tipo,
        cortado: row.cortado,
        estado_servicio_id: row.estado_servicio_id, // necesario para orden
      }))
      .sort((a, b) => b.estado_servicio_id - a.estado_servicio_id) // orden descendente
      .map(({ estado_servicio_id, ...rest }) => rest); // ❌ elimina ese campo del resultado

    return { cedula, nombre_completo, servicios };
  } catch (error) {
    console.error("❌ Error en selectDataArrayActivosByCed:", error.message);
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

//✅ QUERY PARA OBTENER LOS DATOS POR LA ORDENDE INTSLACACION
async function selectByOrdnIns(servicioOrdIns) {
  try {
    const pool = await poolsql;

    const result = await pool
      .request()
      .input("servicioOrdIns", sql.VarChar, servicioOrdIns).query(`
        SELECT 
          ORDEN_CLIENTE.cli_cedula AS cedula,
          c.cli_nombres + ' ' + c.cli_apellidos AS nombre_completo,
          ORDEN_CLIENTE.ord_ins_id AS orden_instalacion,
          ORDEN_CLIENTE.ord_ins_fecha_instalacion AS fecha_instalacion,
          ORDEN_CLIENTE.ord_ins_direccion AS direccion,
          ORDEN_CLIENTE.ord_ins_referencia_direccion AS referencia,
          ORDEN_CLIENTE.ord_ins_ip_equipo_final AS ip,
          ORDEN_CLIENTE.ord_ins_telefonos AS telefonos,
          ORDEN_CLIENTE.ord_ins_coordenadas_x + ',' + ORDEN_CLIENTE.ord_ins_coordenadas_y AS coordenadas,
          IIF(ORDEN_CLIENTE.ord_ins_estado_sin_servicio = 'True', 'SI', 'NO') AS cortado,
          t_Estado_Ordenes_Instalaciones.est_ord_ins_nombre AS estado_instalacion,
          t_Estado_Servicio_Internet.est_ser_int_nombre AS servicio,
          ORDEN_CLIENTE.est_ser_int_id AS estado_servicio_id, -- 🔑 agregado para ordenar
          t_Servicios_Internet.ser_int_nombre AS tipo_instalacion,
          t_Forma_Servicio.for_ser_nombre AS tipo,
          t_Planes_Internet.pla_int_nombre AS plan_nombre,
          t_Planes_Internet.pla_int_precio AS precio,
          CASE 
            WHEN ORDEN_CLIENTE.ord_ins_fecha_pago IS NOT NULL THEN 'PAGADO'
            ELSE 'PENDIENTE'
          END AS estado,
          EMPLEADO_TECNICO.emp_nombres + ' ' + EMPLEADO_TECNICO.emp_apellidos AS instalado_por

        FROM 
          t_Ordenes_Instalaciones AS ORDEN_CLIENTE
          INNER JOIN t_Planes_Internet ON t_Planes_Internet.pla_int_id = ORDEN_CLIENTE.pla_int_id
          INNER JOIN t_Forma_Servicio ON t_Forma_Servicio.for_ser_id = ORDEN_CLIENTE.for_ser_id
          INNER JOIN t_Estado_Ordenes_Instalaciones ON t_Estado_Ordenes_Instalaciones.est_ord_ins_id = ORDEN_CLIENTE.est_ord_id
          INNER JOIN t_Estado_Servicio_Internet ON t_Estado_Servicio_Internet.est_ser_int_id = ORDEN_CLIENTE.est_ser_int_id
          INNER JOIN t_Servicios_Internet ON t_Servicios_Internet.ser_int_id = ORDEN_CLIENTE.ser_int_id
          LEFT JOIN t_Empleados AS EMPLEADO_TECNICO ON EMPLEADO_TECNICO.emp_id = ORDEN_CLIENTE.emp_id
          LEFT JOIN t_Clientes AS c ON c.cli_cedula = ORDEN_CLIENTE.cli_cedula

        WHERE ORDEN_CLIENTE.est_ser_int_id <> 10
        AND ORDEN_CLIENTE.ord_ins_id = @servicioOrdIns
        ORDER BY 
          ORDEN_CLIENTE.ord_ins_fecha_instalacion DESC;
      `);

    const rows = result.recordset;

    if (rows.length === 0) return null;

    const { cedula, nombre_completo } = rows[0];
    const servicios = rows
      .map((row) => ({
        coordenadas: row.coordenadas?.trim() ?? "",
        ip: row.ip,
        direccion: row.direccion,
        referencia: row.referencia,
        orden_instalacion: row.orden_instalacion,
        fecha_instalacion: row.fecha_instalacion,
        telefonos: row.telefonos,
        estado: row.estado,
        instalado_por: row.instalado_por,
        plan_nombre: row.plan_nombre,
        precio: row.precio,
        servicio: row.servicio,
        estado_instalacion: row.estado_instalacion,
        tipo_instalacion: row.tipo_instalacion,
        tipo: row.tipo,
        cortado: row.cortado,
        estado_servicio_id: row.estado_servicio_id, // necesario para orden
      }))
      .sort((a, b) => b.estado_servicio_id - a.estado_servicio_id) // orden descendente
      .map(({ estado_servicio_id, ...rest }) => rest); // ❌ elimina ese campo del resultado

    return { cedula, nombre_completo, servicios };
  } catch (error) {
    console.error("❌ Error en selectByOrdnIns:", error.message);
    throw error;
  }
}


// ✅ QUERY PARA OBTENER LOS DATOS NOMBRES Y APELLIDOS DE TODOS LOS CLIENTES REGISTRADOS EN LATACUNGA
async function selectAllInstPend() {
  try {
    const pool = await poolsql.catch((err) => {
      console.error("❌ Error al conectar al pool:", err.message);
      throw new Error("Error de base de datos");
    });

    const result = await pool.request().query(`
SELECT *
FROM t_Ordenes_Instalaciones o
JOIN t_Sucursales s ON o.suc_id = s.suc_id
WHERE o.est_ord_id = 3
  AND s.suc_nombre = 'LATACUNGA';
    `
  );

    return result.recordset;
  } catch (error) {
    console.error("❌ Error en selectAllInstPend:", error.message);
    throw error;
  }
}

module.exports = {
  selectAllDataBasicos,
  selectDataBasicosActivos,
  selectAllDataArrayByCed,
  selectDataArrayActivosByCed,
  selectAllDataMapa,
  selectByOrdnIns,
  selectAllInstPend

};
