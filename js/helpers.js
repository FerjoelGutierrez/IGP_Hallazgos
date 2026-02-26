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
async function saveRecordsToSupabase(records) {
  const sb = getSupabase();
  if (!sb) { console.warn('Supabase no configurado, usando localStorage'); return false; }

  try {
    // Limpiar registros anteriores
    await sb.from('igp_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Preparar datos para insertar
    const rows = records.map(r => ({
      unidad: r["Unidad"] || null,
      area: r["Área"] || null,
      auditor_asignado: r["Auditor Asignado"] || '',
      programador: r["Programador"] || null,
      fecha_creacion: r["Fecha de Creación"] || null,
      tipo_auditoria: r["Tipo de Auditoría"] || null,
      estado: r["Estado"] || 'Pendiente',
      observaciones: r["Observaciones"] || '',
      planta: getPlantFromAuditor(r["Auditor Asignado"]),
      raw_data: r
    }));

    // Insertar en lotes de 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await sb.from('igp_records').insert(batch);
      if (error) { console.error('Error insertando lote:', error); return false; }
    }
    console.log(`✅ ${rows.length} registros guardados en Supabase`);
    return true;
  } catch (err) {
    console.error('Error guardando en Supabase:', err);
    return false;
  }
}

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

async function deleteAllRecordsFromSupabase() {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    await sb.from('igp_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return true;
  } catch (err) {
    console.error('Error eliminando de Supabase:', err);
    return false;
  }
}
