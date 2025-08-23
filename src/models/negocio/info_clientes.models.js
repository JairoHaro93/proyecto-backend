const { poolsql } = require("../../config/db");
const sql = require("mssql");

/** Obtiene un request del pool, conectando si es necesario */
async function getRequest() {
  // Si poolsql ya es un ConnectionPool conectado:
  if (poolsql && typeof poolsql.request === "function" && poolsql.connected) {
    return poolsql.request();
  }
  // Si no hay conexión aún:
  if (poolsql && typeof poolsql.connect === "function") {
    const pool = await poolsql.connect();
    return pool.request();
  }
  // Si poolsql es una promesa (algunos setups):
  const pool = await poolsql;
  return pool.request();
}

/** Construye parámetros @p0,@p1,... y los agrega al request */
function buildInParams(request, values, varcharLen = 50) {
  const paramNames = [];
  values.forEach((val, idx) => {
    const pname = `p${idx}`;
    const isNumber = typeof val === "number" || /^[0-9]+$/.test(String(val));
    if (isNumber) {
      request.input(pname, sql.Int, Number(val));
    } else {
      request.input(pname, sql.VarChar(varcharLen), String(val));
    }
    paramNames.push(`@${pname}`);
  });
  return paramNames;
}

/** ===================== SUGERENCIAS ===================== */

/** Clientes (todas las órdenes) por nombre/apellido, sucursal y término */
async function selectClientesSugerencias({ term, sucursal, limit }) {
  const request = await getRequest();
  request.input("term", term + "%");
  request.input("termLike", "%" + term + "%");
  request.input("sucursal", sucursal);
  request.input("limit", sql.Int, limit);

  const q = `
    SELECT DISTINCT TOP (@limit)
      c.cli_cedula AS cedula,
      CONCAT(c.cli_nombres, ' ', c.cli_apellidos) COLLATE Latin1_General_CI_AI AS nombre_completo
    FROM t_Clientes c
    JOIN t_Ordenes_Instalaciones o ON o.cli_cedula = c.cli_cedula
    JOIN t_Sucursales s ON s.suc_id = o.suc_id
    WHERE s.suc_nombre = @sucursal
      AND (
        c.cli_nombres COLLATE Latin1_General_CI_AI LIKE @term
        OR c.cli_apellidos COLLATE Latin1_General_CI_AI LIKE @term
        OR CONCAT(c.cli_nombres, ' ', c.cli_apellidos) COLLATE Latin1_General_CI_AI LIKE @termLike
      )
    ORDER BY nombre_completo;
  `;
  const result = await request.query(q);
  return result.recordset;
}

/** Clientes con servicios ACTIVOS por nombre/apellido, sucursal y término */
async function selectClientesSugerenciasActivos({ term, sucursal, limit }) {
  const request = await getRequest();
  request.input("term", term + "%");
  request.input("termLike", "%" + term + "%");
  request.input("sucursal", sucursal);
  request.input("limit", sql.Int, limit);

  const q = `
    SELECT DISTINCT TOP (@limit)
      c.cli_cedula AS cedula,
      CONCAT(c.cli_nombres, ' ', c.cli_apellidos) COLLATE Latin1_General_CI_AI AS nombre_completo
    FROM t_Clientes c
    JOIN t_Ordenes_Instalaciones o ON o.cli_cedula = c.cli_cedula
    JOIN t_Sucursales s ON s.suc_id = o.suc_id
    WHERE s.suc_nombre = @sucursal
      AND o.est_ser_int_id <> 10
      AND (
        c.cli_nombres COLLATE Latin1_General_CI_AI LIKE @term
        OR c.cli_apellidos COLLATE Latin1_General_CI_AI LIKE @term
        OR CONCAT(c.cli_nombres, ' ', c.cli_apellidos) COLLATE Latin1_General_CI_AI LIKE @termLike
      )
    ORDER BY nombre_completo;
  `;
  const result = await request.query(q);
  return result.recordset;
}

/** ===================== DETALLES POR CÉDULA ===================== */

/** Todos los servicios de una cédula (ordenados por fecha desc), prioriza “CLIENTE ELIMINADO” arriba */
async function selectAllDataArrayByCed(cedulaParam) {
  try {
    const request = await getRequest();
    request.input("cli_cedula", sql.VarChar, cedulaParam);

    const q = `
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
        ORDEN_CLIENTE.est_ser_int_id AS estado_servicio_id,
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
    `;

    const result = await request.query(q);
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
        estado_servicio_id: row.estado_servicio_id,
      }))
      .sort((a, b) => {
        const aEliminado = a.servicio === "CLIENTE ELIMINADO";
        const bEliminado = b.servicio === "CLIENTE ELIMINADO";
        if (aEliminado && !bEliminado) return -1;
        if (!aEliminado && bEliminado) return 1;
        return new Date(b.fecha_instalacion) - new Date(a.fecha_instalacion); // más reciente primero
      })
      .map(({ estado_servicio_id, ...rest }) => rest);

    return { cedula, nombre_completo, servicios };
  } catch (error) {
    console.error("❌ Error en selectAllDataArrayByCed:", error.message);
    throw error;
  }
}

/** Solo servicios ACTIVOS de una cédula (orden descendente por estado_servicio_id) */
async function selectDataArrayActivosByCed(cedulaParam) {
  try {
    const request = await getRequest();
    request.input("cli_cedula", sql.VarChar, cedulaParam);

    // Restauro columnas usadas en el mapeo
    const q = `
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
        ORDEN_CLIENTE.est_ser_int_id AS estado_servicio_id,
        t_Servicios_Internet.ser_int_nombre AS tipo_instalacion,
        t_Forma_Servicio.for_ser_nombre AS tipo,
        t_Planes_Internet.pla_int_nombre AS plan_nombre,
        t_Planes_Internet.pla_int_precio AS precio,
        CASE 
          WHEN ORDEN_CLIENTE.ord_ins_fecha_pago IS NOT NULL THEN 'PAGADO'
          ELSE 'PENDIENTE'
        END AS estado
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
    `;

    const result = await request.query(q);
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
        // instalado_por no provisto en este query
        plan_nombre: row.plan_nombre,
        precio: row.precio,
        servicio: row.servicio,
        estado_instalacion: row.estado_instalacion,
        tipo_instalacion: row.tipo_instalacion,
        tipo: row.tipo,
        cortado: row.cortado,
        estado_servicio_id: row.estado_servicio_id,
      }))
      .sort((a, b) => b.estado_servicio_id - a.estado_servicio_id)
      .map(({ estado_servicio_id, ...rest }) => rest);

    return { cedula, nombre_completo, servicios };
  } catch (error) {
    console.error("❌ Error en selectDataArrayActivosByCed:", error.message);
    throw error;
  }
}

/** ===================== MAPA ===================== */

async function selectAllDataMapa() {
  try {
    const request = await getRequest();
    const q = `
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
    `;
    const result = await request.query(q);

    const grouped = result.recordset.reduce((acc, row) => {
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
        coordenadas: (coordenadas || "").trim(),
        ip,
        orden_instalacion,
        deuda,
        meses_deuda,
        enlace,
      });

      return acc;
    }, []);

    return grouped;
  } catch (error) {
    console.error("❌ Error en selectAllDataMapa:", error.message);
    throw error;
  }
}

/** ===================== DETALLE POR ORD_INS ===================== */

async function selectByOrdnIns(servicioOrdIns) {
  try {
    const request = await getRequest();
    request.input("servicioOrdIns", sql.VarChar, servicioOrdIns);

    const q = `
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
        ORDEN_CLIENTE.est_ser_int_id AS estado_servicio_id,
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
    `;

    const result = await request.query(q);
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
        estado_servicio_id: row.estado_servicio_id,
      }))
      .sort((a, b) => b.estado_servicio_id - a.estado_servicio_id)
      .map(({ estado_servicio_id, ...rest }) => rest);

    return { cedula, nombre_completo, servicios };
  } catch (error) {
    console.error("❌ Error en selectByOrdnIns:", error.message);
    throw error;
  }
}

/** ===================== INSTALACIONES PENDIENTES ===================== */

async function selectAllInstPend() {
  try {
    const request = await getRequest();
    const q = `
      SELECT *
      FROM t_Ordenes_Instalaciones o
      JOIN t_Sucursales s ON o.suc_id = s.suc_id
      WHERE o.est_ord_id = 3
        AND s.suc_nombre = 'LATACUNGA';
    `;
    const result = await request.query(q);
    return result.recordset;
  } catch (error) {
    console.error("❌ Error en selectAllInstPend:", error.message);
    throw error;
  }
}

/** ===================== BATCH POR ORD_INS ===================== */

async function fetchClientesByOrdInsBatch(ordInsList) {
  if (!Array.isArray(ordInsList) || ordInsList.length === 0) return [];

  const MAX_ITEMS = 500;
  const clean = Array.from(
    new Set(
      ordInsList
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => v !== "" && v !== null && v !== undefined)
    )
  ).slice(0, MAX_ITEMS);

  if (clean.length === 0) return [];

  try {
    const pool = await poolsql;
    const request = pool.request();
    const inParams = buildInParams(request, clean);

    const query = `
      SELECT 
        oi.ord_ins_id                          AS orden_instalacion,
        c.cli_cedula                           AS cedula,
        (c.cli_nombres + ' ' + c.cli_apellidos) AS nombre_completo,
        oi.ord_ins_direccion                   AS direccion,
        oi.ord_ins_telefonos                   AS telefonos,
        (oi.ord_ins_coordenadas_x + ',' + oi.ord_ins_coordenadas_y) AS coordenadas,
        oi.ord_ins_ip_equipo_final             AS ip,
        p.pla_int_nombre                       AS plan_nombre,
        p.pla_int_precio                       AS precio,
        esi.est_ser_int_nombre                 AS servicio
      FROM t_Ordenes_Instalaciones oi
      JOIN t_Clientes c ON c.cli_cedula = oi.cli_cedula
      LEFT JOIN t_Planes_Internet p ON p.pla_int_id = oi.pla_int_id
      LEFT JOIN t_Estado_Servicio_Internet esi ON esi.est_ser_int_id = oi.est_ser_int_id
      WHERE oi.ord_ins_id IN (${inParams.join(",")})
    `;

    const { recordset } = await request.query(query);
    return recordset || [];
  } catch (err) {
    console.error("[fetchClientesByOrdInsBatch] Error:", err?.message);
    throw err;
  }
}

module.exports = {
  // Sugerencias
  selectClientesSugerencias,
  selectClientesSugerenciasActivos,
  // Detalles por cédula
  selectAllDataArrayByCed,
  selectDataArrayActivosByCed,
  // Mapa
  selectAllDataMapa,
  // Detalle por ord_ins
  selectByOrdnIns,
  // Instalaciones pendientes
  selectAllInstPend,
  // Batch
  fetchClientesByOrdInsBatch,
};
