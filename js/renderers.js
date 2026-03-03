// ============================================
// IGP Dashboard – Renderizado (Charts, Tables, KPIs)
// ============================================

let charts = {};

function renderKPIs(data) {
  let e = 0, p = 0, ep = 0, t = 0;
  data.forEach(r => {
    const s = getShortStatus(r["Estado"]);
    if (s === 'E') e++; else if (s === 'P') p++; else if (s === 'EP') ep++;
    t++;
  });
  const cumplimiento = t ? ((e / t) * 100).toFixed(1) + '%' : '0%';
  document.getElementById('kpi-total').textContent = t;
  document.getElementById('kpi-ejec').textContent = e;
  document.getElementById('kpi-proc').textContent = ep;
  document.getElementById('kpi-pend').textContent = p;
  document.getElementById('kpi-cump').textContent = cumplimiento;
  document.getElementById('kpi-cump-sub').textContent = `Ejecutadas (${e}) vs Total Filtrado (${t})`;
}

function renderCharts(data) {
  const mData = { E: Array(12).fill(0), P: Array(12).fill(0) };
  let cE = 0, cP = 0, cEP = 0;

  const plantStats = {};
  Object.keys(PLANT_GROUPS).forEach(p => plantStats[p] = { E: 0, P: 0, EP: 0 });
  plantStats["Otros"] = { E: 0, P: 0, EP: 0 };

  data.forEach(r => {
    const s = getShortStatus(r["Estado"]);
    if (s === 'E') cE++; else if (s === 'P') cP++; else if (s === 'EP') cEP++;

    const d = r["Fecha de Creación"];
    let m = 0;
    if (d instanceof Date) m = d.getMonth() + 1;
    else if (typeof d === 'string' && d.length >= 7) m = parseInt(d.substring(5, 7));

    if (m) {
      if (s === 'E') mData.E[m - 1]++;
      if (s === 'P') mData.P[m - 1]++;
    }

    const aud = r["Auditor Asignado"]?.toLowerCase().trim();
    const p = AUDITOR_TO_PLANT[aud] || "Otros";
    if (plantStats[p]) {
      if (s === 'E') plantStats[p].E++;
      if (s === 'P') plantStats[p].P++;
      if (s === 'EP') plantStats[p].EP++;
    }
  });

  const ctxOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } };

  if (charts.evo) charts.evo.destroy();
  charts.evo = new Chart(document.getElementById('chart-evolution'), {
    type: 'bar',
    data: {
      labels: MONTH_NAMES.slice(1),
      datasets: [
        { label: 'Ejecutadas', data: mData.E, backgroundColor: '#0F172A' },
        { label: 'Pendientes', data: mData.P, backgroundColor: '#EF4444' }
      ]
    },
    options: ctxOpts
  });

  if (charts.dist) charts.dist.destroy();
  charts.dist = new Chart(document.getElementById('chart-dist'), {
    type: 'doughnut',
    data: {
      labels: ['Ejecutadas', 'Pendientes', 'En Proceso'],
      datasets: [{ data: [cE, cP, cEP], backgroundColor: ['#0F172A', '#EF4444', '#F59E0B'] }]
    },
    options: ctxOpts
  });

  if (charts.plant) charts.plant.destroy();
  const pLabels = Object.keys(plantStats).filter(k => plantStats[k].E + plantStats[k].P + plantStats[k].EP > 0);
  charts.plant = new Chart(document.getElementById('chart-plant'), {
    type: 'bar',
    data: {
      labels: pLabels,
      datasets: [
        { label: 'Ejecutadas', data: pLabels.map(p => plantStats[p].E), backgroundColor: '#0F172A' },
        { label: 'Pendientes', data: pLabels.map(p => plantStats[p].P), backgroundColor: '#EF4444' },
        { label: 'En Proceso', data: pLabels.map(p => plantStats[p].EP), backgroundColor: '#F59E0B' }
      ]
    },
    options: { ...ctxOpts, scales: { x: { stacked: true }, y: { stacked: true } } }
  });

  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(document.getElementById('chart-trend'), {
    type: 'line',
    data: {
      labels: MONTH_NAMES.slice(1),
      datasets: [{
        label: '% Cumplimiento',
        data: mData.E.map((e, i) => {
          const t = e + mData.P[i]; return t ? (e / t) * 100 : 0;
        }),
        borderColor: '#0EA5E9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true
      }]
    },
    options: ctxOpts
  });
}

function renderMatrix(data) {
  const auds = {};
  data.forEach(r => {
    const a = r["Auditor Asignado"];
    if (a) {
      const d = r["Fecha de Creación"];
      let m = 0;
      if (d instanceof Date) m = d.getMonth() + 1;
      else if (typeof d === 'string' && d.length >= 7) m = parseInt(d.substring(5, 7));

      if (m) {
        if (!auds[a]) auds[a] = {};
        auds[a][m] = getShortStatus(r["Estado"]);
      }
    }
  });

  let h = `<table><thead><tr><th style="text-align:left;">Inspector</th>`;
  for (let i = 1; i <= 12; i++) h += `<th>${MONTH_NAMES[i]}</th>`;
  h += `</tr></thead><tbody>`;

  Object.keys(auds).sort().forEach(a => {
    h += `<tr><td style="text-align:left;">${a}</td>`;
    for (let i = 1; i <= 12; i++) {
      const s = auds[a][i] || "ND";
      h += `<td class="cell-${s.toLowerCase()}">${s === 'ND' ? '' : s}</td>`;
    }
    h += `</tr>`;
  });
  h += `</tbody></table>`;
  document.getElementById('table-matrix-container').innerHTML = h;
}

function renderPlantReport(data) {
  const container = document.getElementById('plant-reports-container');
  container.innerHTML = '';

  Object.keys(PLANT_GROUPS).forEach(plant => {
    const programmersName = PLANT_PROGRAMMER[plant] || "N/D";
    const auditors = PLANT_GROUPS[plant];
    const plantData = data.filter(r => auditors.includes(r["Auditor Asignado"]));
    if (plantData.length === 0) return;

    const audRecordsMap = {}; // auditor -> [recs]
    const audTypeCounts = {}; // auditor -> { igp: N, hallazgo: N }

    auditors.forEach(a => {
      const recs = plantData.filter(r => r["Auditor Asignado"] === a);
      if (recs.length > 0) {
        audRecordsMap[a] = recs;
        // Contar por tipo
        let igpCount = 0, hallazgoCount = 0;
        recs.forEach(r => {
          const tipo = (r["Tipo de Auditoría"] || '').toLowerCase();
          if (tipo.includes('hallazgo') || tipo.includes('acto') || tipo.includes('subestandar') || tipo.includes('subestándar')) {
            hallazgoCount++;
          } else {
            igpCount++;
          }
        });
        audTypeCounts[a] = { igp: igpCount, hallazgo: hallazgoCount };
      }
    });

    const activeAuds = Object.keys(audRecordsMap);
    if (activeAuds.length === 0) return;

    // Cumplimiento basado en ITEMS (Ejecutados / Total) - Más justo y preciso
    let totalItems = 0;
    let executedItems = 0;
    activeAuds.forEach(a => {
      audRecordsMap[a].forEach(r => {
        totalItems++;
        if (getShortStatus(r["Estado"]) === 'E') executedItems++;
      });
    });
    const compliance = totalItems ? (executedItems / totalItems) * 100 : 0;

    const showArea = (plant === "Planta Exteriores");

    // 1. Obtener sub-áreas únicas para los BOTONES de Exteriores
    let subAreaFilterHTML = '';
    if (showArea) {
      const subAreas = [...new Set(activeAuds.map(a => AUDITOR_AREA[a] || 'N/D'))].sort();
      subAreaFilterHTML = `
        <div class="subarea-buttons" style="display:flex; gap:6px; margin-right:12px;">
          <button class="btn btn-secondary btn-sm active" data-val="all" 
                  onclick="filterPlantTable(this, '${plant.replace(/\s/g, '')}')">Todas</button>
          ${subAreas.map(sa => `
            <button class="btn btn-secondary btn-sm" data-val="${sa}" 
                    onclick="filterPlantTable(this, '${plant.replace(/\s/g, '')}')">${sa}</button>
          `).join('')}
        </div>`;
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header" style="flex-wrap: wrap; gap: 12px;">
        <div style="flex:1; min-width:200px;">
          <h3>${plant}</h3>
          <div style="font-size:12px; color:var(--text-secondary);">
            Programador: <b>${programmersName}</b> · Cumplimiento: ${compliance.toFixed(1)}%
          </div>
        </div>
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
          ${subAreaFilterHTML}
          <button class="btn btn-secondary btn-sm" onclick="exportPlantPDF('${plant}')">
            <i class="fas fa-file-pdf"></i> PDF
          </button>
        </div>
      </div>
      <div class="table-container">
        <table id="table-plant-${plant.replace(/\s/g, '')}">
          <thead><tr>
            <th style="text-align:left;">Inspector</th>
            ${showArea ? '<th>Área</th>' : ''}
            <th>Estado</th>
          </tr></thead>
          <tbody>
            ${activeAuds.map(a => {
              const tc = audTypeCounts[a] || { igp: 0, hallazgo: 0 };
              const area = AUDITOR_AREA[a] || 'N/D';
              const recs = audRecordsMap[a];
              
              let badges = '';
              if (tc.igp > 1) {
                badges += `<span style="font-size:9px;color:#F59E0B;margin-left:4px;font-weight:bold;">
                  <i class="fas fa-exclamation-circle"></i> ${tc.igp} IGP</span>`;
              }
              if (tc.hallazgo > 0) {
                badges += `<span style="font-size:9px;color:#EF4444;margin-left:4px;font-weight:bold;">
                  <i class="fas fa-flag"></i> ${tc.hallazgo} Hallazgo${tc.hallazgo > 1 ? 's' : ''}</span>`;
              }
              const areaCell = showArea
                ? `<td><span style="background:#E0F2FE;color:#0369A1;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;">${area}</span></td>`
                : '';
              
              const statusPills = recs.map(r => {
                const s = getShortStatus(r["Estado"]);
                const tipo = (r["Tipo de Auditoría"] || '').trim();
                const isHallazgo = tipo.toLowerCase().includes('hallazgo') || tipo.toLowerCase().includes('acto') || tipo.toLowerCase().includes('subestandar') || tipo.toLowerCase().includes('subestándar');
                const tipoLabel = isHallazgo ? 'H' : 'IGP';
                const tooltip = `${tipo} — ${r["Estado"] || 'Pendiente'}`;
                return `<span class="status-pill ${s.toLowerCase()}" title="${tooltip}" style="cursor:help;">${tipoLabel}:${s}</span>`;
              }).join(' ');
              
              return `<tr data-subarea="${area}"><td style="text-align:left;">${a} ${badges}</td>
                ${areaCell}
                <td>${statusPills}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    container.appendChild(card);
  });
}

function filterPlantTable(btn, tableId) {
  const val = btn.getAttribute('data-val');
  
  // Actualizar estado activo de los botones
  const parent = btn.parentElement;
  parent.querySelectorAll('button').forEach(b => b.classList.remove('active', 'btn-primary'));
  btn.classList.add('active');
  
  const rows = document.querySelectorAll(`#table-plant-${tableId} tbody tr`);
  rows.forEach(r => {
    if (val === 'all' || r.getAttribute('data-subarea') === val) {
      r.style.display = '';
    } else {
      r.style.display = 'none';
    }
  });
}

// --- PANEL DE ASIGNACIÓN IGP (Editable como Excel) ---
let assignmentData = {}; // cache: { "inspector_mes": { igp_tema, igp_area } }
let currentAssignYear = new Date().getFullYear();

function isIGPType(tipo) {
  if (!tipo) return false;
  return tipo.trim().toUpperCase().startsWith('IGP');
}

async function renderAssignment() {
  const container = document.getElementById('assignment-container');
  if (!container) return;

  // 1. Auto-generar asignaciones SOLO de tipos IGP
  const autoAssignments = {};
  if (typeof rawData !== 'undefined' && rawData.length > 0) {
    rawData.forEach(r => {
      const InspectorRaw = r["Auditor Asignado"] || '';
      if (!InspectorRaw) return;

      const fecha = r["Fecha de Creación"];
      if (!fecha) return;

      let mes = 0;
      let year = 0;

      // --- Normalización de Fecha Ultra-Robusta ---
      if (fecha instanceof Date) {
        mes = fecha.getMonth() + 1;
        year = fecha.getFullYear();
      } else if (typeof fecha === 'string') {
        // Soporta 2026-02-01 y 01/02/2026
        if (fecha.includes('-')) {
          const parts = fecha.split('-');
          if (parts[0].length === 4) { // YYYY-MM-DD
            year = parseInt(parts[0]);
            mes = parseInt(parts[1]);
          }
        } else if (fecha.includes('/')) {
          const parts = fecha.split('/');
          if (parts[2]?.length === 4) { // DD/MM/YYYY
            year = parseInt(parts[2]);
            mes = parseInt(parts[1]);
          }
        }
      } else if (typeof fecha === 'number') {
        const d = new Date((fecha - 25569) * 86400 * 1000);
        mes = d.getMonth() + 1;
        year = d.getFullYear();
      }

      if (year !== currentAssignYear || mes === 0) return;
      
      const key = `${InspectorRaw}_${mes}`;
      if (!autoAssignments[key]) {
        autoAssignments[key] = { igp_tema: '', igp_depto: '' };
      }

      // 1. Extraer Tema (SOLO si es tipo IGP)
      const tipo = (r["Tipo de Auditoría"] || '').trim();
      if (isIGPType(tipo)) {
        if (!autoAssignments[key].igp_tema.includes(tipo)) {
          if (autoAssignments[key].igp_tema) autoAssignments[key].igp_tema += '\n';
          autoAssignments[key].igp_tema += tipo;
        }
      }

      // 2. Extraer Departamento (De CUALQUIER fila del inspector este mes)
      let depto = r["Departamento"] || '';
      // Re-intento de búsqueda si está vacío (por si acaso no se normalizó)
      if (!depto) {
        const dKey = Object.keys(r).find(k => {
          const lk = k.toLowerCase();
          return lk.includes('depto') || lk.includes('departamento') || lk.includes('área de trabajo');
        });
        if (dKey) depto = r[dKey] || '';
      }

      if (depto && !autoAssignments[key].igp_depto.includes(depto)) {
        if (autoAssignments[key].igp_depto) autoAssignments[key].igp_depto += '\n';
        autoAssignments[key].igp_depto += depto;
      }
    });
  }

  // 2. Cargar asignaciones guardadas desde Supabase/localStorage
  const savedAssignments = await loadAssignments(currentAssignYear);
  assignmentData = {};

  // Primero, cargar TODO lo que viene del Excel (lo más fresco)
  Object.keys(autoAssignments).forEach(key => {
    assignmentData[key] = { ...autoAssignments[key] };
  });

  // Segundo, aplicar lo guardado, pero NO sobreescribir con vacíos si el Excel tiene datos
  savedAssignments.forEach(a => {
    const key = `${a.inspector}_${a.mes}`;
    const auto = autoAssignments[key] || { igp_tema: '', igp_depto: '' };

    // Lógica inteligente: Si lo guardado tiene datos, se usa. 
    // Si lo guardado NO tiene departamento pero el Excel SÍ, usamos el del Excel.
    assignmentData[key] = {
      igp_tema: a.igp_tema || auto.igp_tema,
      igp_depto: a.igp_area || auto.igp_depto
    };
  });

  // 3. Auto-guardar/Actualizar: Si el Excel trajo datos nuevos que no estaban en la BD o estaban incompletos
  for (const key of Object.keys(autoAssignments)) {
    const saved = savedAssignments.find(s => `${s.inspector}_${s.mes}` === key);
    const auto = autoAssignments[key];

    // Si no existe en la BD O si en la BD le falta el departamento pero el Excel lo tiene -> Actualizar
    if (!saved || (!saved.igp_area && auto.igp_depto)) {
      const [inspector, mesStr] = key.split(/_(\d+)$/);
      const mes = parseInt(mesStr);
      if (inspector && mes) {
        saveAssignment(inspector, currentAssignYear, mes, 
          assignmentData[key].igp_tema, assignmentData[key].igp_depto);
      }
    }
  }

  // 4. Renderizar tabla
  let html = `
    <div class="card" style="margin-bottom:16px; padding:16px 20px;">
      <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
        <div style="display:flex; align-items:center; gap:8px;">
          <i class="fas fa-calendar-alt" style="color:var(--accent-color);"></i>
          <label style="font-weight:600; font-size:14px;">Año:</label>
          <select id="assign-year-select" onchange="changeAssignYear(this.value)"
            style="padding:8px 18px; border:2px solid var(--border-color); border-radius:8px; font-size:14px; font-weight:700; cursor:pointer;">
            <option value="2024" ${currentAssignYear === 2024 ? 'selected' : ''}>2024</option>
            <option value="2025" ${currentAssignYear === 2025 ? 'selected' : ''}>2025</option>
            <option value="2026" ${currentAssignYear === 2026 ? 'selected' : ''}>2026</option>
          </select>
        </div>
        <span style="font-size:12px; color:var(--text-secondary); background:#F0F9FF; padding:6px 12px; border-radius:20px;">
          <i class="fas fa-info-circle" style="color:var(--accent-color);"></i> Solo IGP · Celdas editables · Auto-guardado
        </span>
      </div>
    </div>`;

  Object.keys(PLANT_GROUPS).forEach(plant => {
    const programmersName = PLANT_PROGRAMMER[plant] || "N/D";
    const auditors = PLANT_GROUPS[plant];
    const showArea = (plant === "Planta Exteriores");

    html += `
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header" style="margin-bottom:10px; padding-bottom:8px;">
          <div>
            <h3 style="font-size:14px;"><i class="fas fa-industry" style="color:#3B7DD8;margin-right:6px;"></i>${plant}</h3>
            <div style="font-size:12px; color:#6B7280; margin-top:2px;">Programador: <b>${programmersName}</b></div>
          </div>
        </div>
        <div class="table-container" style="overflow-x:auto;">
          <table class="assign-table">
            <thead>
              <tr>
                <th style="text-align:left; min-width:160px; position:sticky; left:0; z-index:2; background:#3B7DD8;">Inspectores</th>
                ${showArea ? '<th style="min-width:80px;">Área</th>' : ''}
                <th style="min-width:80px;">Prog.</th>`;

    for (let m = 1; m <= 12; m++) {
      html += `<th colspan="2" style="min-width:260px; text-align:center;">${MONTH_NAMES[m]}</th>`;
    }

    html += `</tr><tr>
                <th style="position:sticky; left:0; z-index:2; background:#3B7DD8; font-size:9px;"></th>
                ${showArea ? '<th style="font-size:9px;"></th>' : ''}
                <th style="font-size:9px;"></th>`;

    for (let m = 1; m <= 12; m++) {
      html += `<th style="font-size:10px;">IGP</th>
               <th style="font-size:10px;">Depto</th>`;
    }

    html += `</tr></thead><tbody>`;

    auditors.forEach(a => {
      const safeName = a.replace(/'/g, "\\'");
      html += `<tr>
        <td style="text-align:left; font-weight:600; font-size:12px; position:sticky; left:0; background:inherit; z-index:1; white-space:nowrap;">${a}</td>
        ${showArea ? `<td style="text-align:center;"><span style="background:#DBEAFE;color:#1D4ED8;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600;">${AUDITOR_AREA[a] || ''}</span></td>` : ''}
        <td style="text-align:center; font-size:11px; color:#6B7280;">${programmersName}</td>`;

      for (let m = 1; m <= 12; m++) {
        const key = `${a}_${m}`;
        const d = assignmentData[key] || { igp_tema: '', igp_depto: '' };
        const temaId = `tema_${plant.replace(/\s/g, '')}_${a.replace(/\s/g, '_')}_${m}`;
        const deptoId = `depto_${plant.replace(/\s/g, '')}_${a.replace(/\s/g, '_')}_${m}`;

        html += `<td class="assign-td">
                  <div class="assign-cell" contenteditable="true" id="${temaId}"
                    data-placeholder="..."
                    onblur="onAssignCellBlur('${safeName}', ${m})"
                    data-inspector="${a}" data-mes="${m}" data-field="tema">${escapeHtml(d.igp_tema).replace(/\n/g, '<br>')}</div>
                </td>
                <td class="assign-td">
                  <div class="assign-cell" contenteditable="true" id="${deptoId}"
                    data-placeholder="..."
                    onblur="onAssignCellBlur('${safeName}', ${m})"
                    data-inspector="${a}" data-mes="${m}" data-field="depto">${escapeHtml(d.igp_depto).replace(/\n/g, '<br>')}</div>
                </td>`;
      }

      html += `</tr>`;
    });

    html += `</tbody></table></div></div>`;
  });

  container.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function onAssignCellBlur(inspector, mes) {
  const allPlants = Object.keys(PLANT_GROUPS);
  let temaVal = '';
  let deptoVal = '';

  for (const plant of allPlants) {
    const pId = plant.replace(/\s/g, '');
    const iId = inspector.replace(/\s/g, '_');
    const temaEl = document.getElementById(`tema_${pId}_${iId}_${mes}`);
    const deptoEl = document.getElementById(`depto_${pId}_${iId}_${mes}`);
    if (temaEl) temaVal = temaEl.innerText.trim();
    if (deptoEl) deptoVal = deptoEl.innerText.trim();
  }

  // Actualizar cache
  const key = `${inspector}_${mes}`;
  assignmentData[key] = { igp_tema: temaVal, igp_depto: deptoVal };

  // Guardar en Supabase (igp_area column stores depto value)
  const ok = await saveAssignment(inspector, currentAssignYear, mes, temaVal, deptoVal);
  if (ok) {
    for (const plant of allPlants) {
      const pId = plant.replace(/\s/g, '');
      const iId = inspector.replace(/\s/g, '_');
      const temaEl = document.getElementById(`tema_${pId}_${iId}_${mes}`);
      if (temaEl) {
        temaEl.style.background = '#D1FAE5';
        setTimeout(() => { temaEl.style.background = ''; }, 800);
      }
    }
  }
}

async function changeAssignYear(year) {
  currentAssignYear = parseInt(year);
  await renderAssignment();
}

function renderDetails(data) {
  let h = `<table><thead><tr>
    <th>Acción</th><th>Unidad</th><th>Área</th><th>Inspector</th>
    <th>Programador</th><th>Fecha</th><th>Estado</th><th>Obs</th>
  </tr></thead><tbody>`;

  data.forEach(r => {
    const s = getShortStatus(r["Estado"]);
    h += `<tr>
      <td><button class="btn btn-secondary btn-sm" onclick="openCRM(${r._id})"><i class="fas fa-edit"></i></button></td>
      <td>${r["Unidad"] || ''}</td><td>${r["Área"] || ''}</td>
      <td>${r["Auditor Asignado"] || ''}</td><td>${r["Programador"] || ''}</td>
      <td>${r["Fecha de Creación"] || ''}</td>
      <td><span class="status-pill ${s.toLowerCase()}">${s}</span></td>
      <td style="font-size:11px;">${r["Observaciones"] || ''}</td></tr>`;
  });
  h += `</tbody></table>`;
  document.getElementById('table-details-container').innerHTML = h;
}

function renderAnalysis(data) {
  const mStats = {};
  data.forEach(r => {
    const d = r["Fecha de Creación"];
    let m = 0;
    if (d instanceof Date) m = d.getMonth() + 1;
    else if (typeof d === 'string' && d.length >= 7) m = parseInt(d.substring(5, 7));

    if (m) {
      if (!mStats[m]) mStats[m] = { e: 0, t: 0 };
      mStats[m].t++;
      if (getShortStatus(r["Estado"]) === 'E') mStats[m].e++;
    }
  });

  let h = `<table><thead><tr><th>Mes</th><th>Ejecutadas</th><th>Total</th><th>%</th></tr></thead><tbody>`;
  Object.keys(mStats).sort((a, b) => a - b).forEach(m => {
    const s = mStats[m];
    h += `<tr><td>${MONTH_NAMES[m]}</td><td>${s.e}</td><td>${s.t}</td><td>${((s.e / s.t) * 100).toFixed(1)}%</td></tr>`;
  });
  document.getElementById('table-analysis-month').innerHTML = h + `</tbody></table>`;

  const aStats = {};
  data.forEach(r => {
    const a = r["Auditor Asignado"];
    if (a) {
      if (!aStats[a]) aStats[a] = { e: 0, t: 0 };
      aStats[a].t++;
      if (getShortStatus(r["Estado"]) === 'E') aStats[a].e++;
    }
  });

  let ha = `<table><thead><tr><th style="text-align:left;">Inspector</th><th>Ejecutadas</th><th>Total</th><th>%</th></tr></thead><tbody>`;
  Object.entries(aStats)
    .sort((a, b) => (b[1].e / b[1].t) - (a[1].e / a[1].t))
    .forEach(([k, v]) => {
      ha += `<tr><td style="text-align:left;">${k}</td><td>${v.e}</td><td>${v.t}</td><td>${((v.e / v.t) * 100).toFixed(1)}%</td></tr>`;
    });
  document.getElementById('table-analysis-auditor').innerHTML = ha + `</tbody></table>`;
}

function generateDynamicAnalysis(data) {
  let e = 0, p = 0, ep = 0, t = 0;
  data.forEach(r => {
    const s = getShortStatus(r["Estado"]);
    if (s === 'E') e++; else if (s === 'P') p++; else if (s === 'EP') ep++;
    t++;
  });

  if (t > 0) {
    const pPct = (p / t) * 100;
    document.getElementById('analysis-dist').innerHTML =
      `Del total de <strong>${t}</strong> registros visibles, el <strong>${((e / t) * 100).toFixed(1)}%</strong> se encuentra ejecutado.
       ${pPct > 20
        ? `Se recomienda enfocar esfuerzos en el <strong>${pPct.toFixed(1)}%</strong> de pendientes visibles.`
        : `El nivel de pendientes es controlado.`}`;
    document.getElementById('analysis-evolution').innerHTML = `Análisis actualizado basado en ${t} registros.`;
    document.getElementById('analysis-plant').innerHTML = "Comparativa de carga y cumplimiento por planta según filtros activos.";
  }
}
