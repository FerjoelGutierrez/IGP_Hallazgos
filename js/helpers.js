// ============================================
// IGP Dashboard – Funciones Auxiliares
// ============================================

function getShortStatus(s) {
  if (!s) return "ND";
  s = s.toLowerCase();
  if (s.includes("proce") || s.includes("curso")) return "EP";
  if (s.includes("ejecut") || s.includes("termin") || s.includes("cerrad")) return "E";
  if (s.includes("pend")) return "P";
  return "ND";
}

function getCompositeKey(r) {
  const fecha = r["Fecha de Creación"];
  let fStr = "";
  if (fecha instanceof Date) fStr = fecha.toISOString().substring(0, 10);
  else fStr = (fecha || "").toString().substring(0, 10);

  const auditor = (r["Auditor Asignado"] || "").toString().toLowerCase().trim();
  const area = (r["Área"] || "").toString().toLowerCase().trim();
  const unidad = (r["Unidad"] || "").toString().toLowerCase().trim();

  return `${fStr}_${auditor}_${area}_${unidad}`;
}

function getProgrammerFromAuditor(auditorName) {
  const plant = AUDITOR_TO_PLANT[(auditorName || '').toLowerCase().trim()] || 'Otros';
  return PLANT_PROGRAMMER[plant] || 'N/D';
}

function getPlantFromAuditor(auditorName) {
  return AUDITOR_TO_PLANT[(auditorName || '').toLowerCase().trim()] || 'Otros';
}

// --- SUPABASE DATA OPERATIONS ---

// Genera clave normalizada para comparar registros (case-insensitive, trimmed)
function makeRecordKey(fechaCreacion, auditor, area, unidad) {
  let fStr = '';
  if (fechaCreacion instanceof Date) {
    fStr = fechaCreacion.toISOString().substring(0, 10);
  } else {
    fStr = (fechaCreacion || '').toString().substring(0, 10);
  }
  return `${fStr}_${(auditor || '').toString().toLowerCase().trim()}_${(area || '').toString().toLowerCase().trim()}_${(unidad || '').toString().toLowerCase().trim()}`;
}

// Guardar registros en Supabase: INSERTA nuevos y ACTUALIZA existentes si el estado cambió
async function saveRecordsToSupabase(records) {
  const sb = getSupabase();
  if (!sb) { console.warn('Supabase no configurado, usando localStorage'); return false; }

  try {
    // Obtener registros existentes CON id y estado para poder actualizar
    const { data: existing } = await sb.from('igp_records').select('id, auditor_asignado, fecha_creacion, area, unidad, estado, observaciones');
    
    const existingMap = new Map(); // key -> { id, estado, observaciones }
    if (existing) {
      existing.forEach(r => {
        const key = makeRecordKey(r.fecha_creacion, r.auditor_asignado, r.area, r.unidad);
        existingMap.set(key, { id: r.id, estado: r.estado || '', observaciones: r.observaciones || '' });
      });
    }

    const newRecords = [];
    const updatedRecords = []; // { supabaseId, estado, observaciones, tipo_auditoria }

    records.forEach(r => {
      const key = makeRecordKey(r["Fecha de Creación"], r["Auditor Asignado"], r["Área"], r["Unidad"]);
      const existingRec = existingMap.get(key);
      const incomingEstado = r["Estado"] || 'Pendiente';
      const incomingObs = r["Observaciones"] || '';

      if (!existingRec) {
        // Registro completamente nuevo
        newRecords.push(r);
      } else {
        // Ya existe → verificar si el estado cambió
        if (existingRec.estado !== incomingEstado) {
          updatedRecords.push({
            supabaseId: existingRec.id,
            estado: incomingEstado,
            observaciones: incomingObs || existingRec.observaciones,
            tipo_auditoria: r["Tipo de Auditoría"] || null
          });
        }
      }
    });

    // 1. Insertar registros nuevos en lotes de 500
    if (newRecords.length > 0) {
      const rows = newRecords.map(r => ({
        unidad: r["Unidad"] || null,
        area: r["Área"] || null,
        auditor_asignado: r["Auditor Asignado"] || '',
        programador: r["Programador"] || null,
        fecha_creacion: r["Fecha de Creación"] || null,
        tipo_auditoria: r["Tipo de Auditoría"] || null,
        estado: r["Estado"] || 'Pendiente',
        observaciones: r["Observaciones"] || '',
        planta: getPlantFromAuditor(r["Auditor Asignado"]),
        departamento: r["Departamento"] || null
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await sb.from('igp_records').insert(batch);
        if (error) { console.error('Error insertando lote:', error); return false; }
      }
    }

    // 2. Actualizar registros existentes cuyo estado cambió
    let updateCount = 0;
    for (const rec of updatedRecords) {
      const updateData = { estado: rec.estado };
      if (rec.observaciones) updateData.observaciones = rec.observaciones;
      if (rec.tipo_auditoria) updateData.tipo_auditoria = rec.tipo_auditoria;

      const { error } = await sb.from('igp_records')
        .update(updateData)
        .eq('id', rec.supabaseId);
      
      if (error) {
        console.error('Error actualizando registro:', error);
      } else {
        updateCount++;
      }
    }

    console.log(`✅ Supabase sync: ${newRecords.length} nuevos, ${updateCount} actualizados, ${records.length - newRecords.length - updatedRecords.length} sin cambios`);
    return true;
  } catch (err) {
    console.error('Error guardando en Supabase:', err);
    return false;
  }
}

// Cargar TODOS los registros desde Supabase
async function loadRecordsFromSupabase() {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('igp_records').select('*').order('fecha_creacion', { ascending: true });
    if (error) { console.error('Error cargando de Supabase:', error); return null; }
    if (!data || data.length === 0) return null;

    // Convertir de vuelta al formato esperado por la app
    return data.map((row, i) => ({
      _id: i,
      _supabase_id: row.id,
      "Unidad": row.unidad,
      "Área": row.area,
      "Departamento": row.departamento || '',
      "Auditor Asignado": row.auditor_asignado,
      "Programador": row.programador,
      "Fecha de Creación": row.fecha_creacion,
      "Tipo de Auditoría": row.tipo_auditoria,
      "Estado": row.estado,
      "Observaciones": row.observaciones
    }));
  } catch (err) {
    console.error('Error cargando de Supabase:', err);
    return null;
  }
}

// Actualizar un registro específico en Supabase
async function updateRecordInSupabase(supabaseId, estado, observaciones) {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb.from('igp_records').update({
      estado: estado,
      observaciones: observaciones
    }).eq('id', supabaseId);

    if (error) { console.error('Error actualizando:', error); return false; }
    return true;
  } catch (err) {
    console.error('Error actualizando en Supabase:', err);
    return false;
  }
}

// Borrar TODOS los registros de Supabase
async function deleteAllRecordsFromSupabase() {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    await sb.from('igp_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await sb.from('igp_assignments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return true;
  } catch (err) {
    console.error('Error eliminando de Supabase:', err);
    return false;
  }
}

// --- ASSIGNMENTS CRUD ---

// Cargar asignaciones de un año
async function loadAssignments(anio) {
  const sb = getSupabase();
  if (!sb) {
    // Fallback localStorage
    const saved = localStorage.getItem('IGP_Assignments_' + anio);
    return saved ? JSON.parse(saved) : [];
  }

  try {
    const { data, error } = await sb.from('igp_assignments')
      .select('*')
      .eq('anio', anio)
      .order('inspector', { ascending: true });
    if (error) { console.error('Error cargando asignaciones:', error); return []; }
    return data || [];
  } catch (err) {
    console.error('Error cargando asignaciones:', err);
    return [];
  }
}

// Guardar/actualizar una asignación (upsert por inspector+año+mes)
async function saveAssignment(inspector, anio, mes, igpTema, igpArea) {
  const sb = getSupabase();

  // Guardar también en localStorage como backup
  const localKey = 'IGP_Assignments_' + anio;
  const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
  const existingIdx = localData.findIndex(a => a.inspector === inspector && a.mes === mes);
  const record = {
    inspector,
    area_inspector: AUDITOR_AREA[inspector] || '',
    programador: getProgrammerFromAuditor(inspector),
    planta: getPlantFromAuditor(inspector),
    anio,
    mes,
    igp_tema: igpTema,
    igp_area: igpArea
  };
  if (existingIdx >= 0) {
    localData[existingIdx] = { ...localData[existingIdx], ...record };
  } else {
    localData.push(record);
  }
  localStorage.setItem(localKey, JSON.stringify(localData));

  if (!sb) return true;

  try {
    const { data: existing } = await sb.from('igp_assignments')
      .select('id')
      .eq('inspector', inspector)
      .eq('anio', anio)
      .eq('mes', mes)
      .maybeSingle();

    if (existing) {
      // Update
      const { error } = await sb.from('igp_assignments')
        .update({ igp_tema: igpTema, igp_area: igpArea })
        .eq('id', existing.id);
      if (error) { console.error('Error actualizando asignación:', error); return false; }
    } else {
      // Insert
      const { error } = await sb.from('igp_assignments').insert(record);
      if (error) { console.error('Error insertando asignación:', error); return false; }
    }
    return true;
  } catch (err) {
    console.error('Error guardando asignación:', err);
    return false;
  }
}
