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
  return `${r["Fecha de Creación"] || ''}_${r["Auditor Asignado"] || ''}_${r["Área"] || ''}_${r["Unidad"] || ''}`;
}

function getProgrammerFromAuditor(auditorName) {
  const plant = AUDITOR_TO_PLANT[(auditorName || '').toLowerCase().trim()] || 'Otros';
  return PLANT_PROGRAMMER[plant] || 'N/D';
}

function getPlantFromAuditor(auditorName) {
  return AUDITOR_TO_PLANT[(auditorName || '').toLowerCase().trim()] || 'Otros';
}

// --- SUPABASE DATA OPERATIONS ---

// Guardar registros NUEVOS en Supabase (ACUMULA, no reemplaza)
async function saveRecordsToSupabase(records) {
  const sb = getSupabase();
  if (!sb) { console.warn('Supabase no configurado, usando localStorage'); return false; }

  try {
    // Obtener claves existentes para evitar duplicados
    const { data: existing } = await sb.from('igp_records').select('auditor_asignado, fecha_creacion, area, unidad');
    const existingKeys = new Set();
    if (existing) {
      existing.forEach(r => {
        const key = `${r.fecha_creacion || ''}_${r.auditor_asignado || ''}_${r.area || ''}_${r.unidad || ''}`;
        existingKeys.add(key);
      });
    }

    // Filtrar solo registros NUEVOS (que no existen ya)
    const newRecords = records.filter(r => {
      const key = `${r["Fecha de Creación"] || ''}_${r["Auditor Asignado"] || ''}_${r["Área"] || ''}_${r["Unidad"] || ''}`;
      return !existingKeys.has(key);
    });

    if (newRecords.length === 0) {
      console.log('ℹ️ No hay registros nuevos para guardar (todos ya existen)');
      return true;
    }

    // Preparar datos para insertar
    const rows = newRecords.map(r => ({
      unidad: r["Unidad"] || null,
      area: r["Área"] || null,
      auditor_asignado: r["Auditor Asignado"] || '',
      programador: r["Programador"] || null,
      fecha_creacion: r["Fecha de Creación"] || null,
      tipo_auditoria: r["Tipo de Auditoría"] || null,
      estado: r["Estado"] || 'Pendiente',
      observaciones: r["Observaciones"] || '',
      planta: getPlantFromAuditor(r["Auditor Asignado"])
    }));

    // Insertar en lotes de 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await sb.from('igp_records').insert(batch);
      if (error) { console.error('Error insertando lote:', error); return false; }
    }
    console.log(`✅ ${newRecords.length} registros NUEVOS guardados en Supabase (${records.length - newRecords.length} ya existían)`);
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
