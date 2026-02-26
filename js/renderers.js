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

    const m = parseInt(r["Fecha de Creación"]?.substring(5, 7));
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
      const m = parseInt(r["Fecha de Creación"]?.substring(5, 7));
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

    const audStats = {};
    const audCounts = {};

    auditors.forEach(a => {
      const recs = plantData.filter(r => r["Auditor Asignado"] === a);
      if (recs.length > 0) {
        audCounts[a] = recs.length;
        let s = "ND";
        if (recs.some(r => getShortStatus(r["Estado"]) === 'P')) s = 'P';
        else if (recs.some(r => getShortStatus(r["Estado"]) === 'EP')) s = 'EP';
        else if (recs.some(r => getShortStatus(r["Estado"]) === 'E')) s = 'E';
        audStats[a] = s;
      }
    });

    const activeAuds = Object.keys(audStats);
    if (activeAuds.length === 0) return;

    const eCount = activeAuds.filter(a => audStats[a] === 'E').length;
    const compliance = (eCount / activeAuds.length) * 100;

    // Solo mostrar columna Área para Planta Exteriores (Andrés Mena)
    const showArea = (plant === "Planta Exteriores");

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3>${plant}</h3>
          <div style="font-size:12px; color:var(--text-secondary);">
            Programador: <b>${programmersName}</b> · Cumplimiento: ${compliance.toFixed(1)}%
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="exportPlantPDF('${plant}')">
          <i class="fas fa-file-pdf"></i> PDF
        </button>
      </div>
      <div class="table-container" id="table-plant-${plant.replace(/\s/g, '')}">
        <table>
          <thead><tr>
            <th style="text-align:left;">Inspector</th>
            ${showArea ? '<th>Área</th>' : ''}
            <th>Estado</th>
          </tr></thead>
          <tbody>
            ${activeAuds.map(a => {
              let warn = audCounts[a] === 2
                ? `<span style="font-size:10px;color:#F59E0B;margin-left:6px;font-weight:bold;">
                     <i class="fas fa-exclamation-circle"></i> 2 IGP</span>` : '';
              const areaCell = showArea
                ? `<td><span style="background:#E0F2FE;color:#0369A1;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;">${AUDITOR_AREA[a] || 'N/D'}</span></td>`
                : '';
              return `<tr><td style="text-align:left;">${a} ${warn}</td>
                ${areaCell}
                <td><span class="status-pill ${audStats[a].toLowerCase()}">${audStats[a]}</span></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    container.appendChild(card);
  });
}

// --- PANEL DE ASIGNACIÓN IGP (Editable como Excel) ---
let assignmentData = {}; // cache: { "inspector_mes": { igp_tema, igp_area } }
let currentAssignYear = new Date().getFullYear();

async function renderAssignment() {
  const container = document.getElementById('assignment-container');
  if (!container) return;

  // Cargar asignaciones del año seleccionado
  const assignments = await loadAssignments(currentAssignYear);
  assignmentData = {};
  assignments.forEach(a => {
    assignmentData[`${a.inspector}_${a.mes}`] = {
      igp_tema: a.igp_tema || '',
      igp_area: a.igp_area || ''
    };
  });

  let html = `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; align-items:center; gap:12px; padding:8px 0;">
        <label style="font-weight:600; font-size:14px;">Año:</label>
        <select id="assign-year-select" onchange="changeAssignYear(this.value)"
          style="padding:8px 16px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:14px; font-weight:600;">
          <option value="2024" ${currentAssignYear === 2024 ? 'selected' : ''}>2024</option>
          <option value="2025" ${currentAssignYear === 2025 ? 'selected' : ''}>2025</option>
          <option value="2026" ${currentAssignYear === 2026 ? 'selected' : ''}>2026</option>
        </select>
        <span style="font-size:12px; color:var(--text-secondary);">
          <i class="fas fa-info-circle"></i> Haz clic en cualquier celda para editar. Los cambios se guardan automáticamente.
        </span>
      </div>
    </div>`;

  Object.keys(PLANT_GROUPS).forEach(plant => {
    const programmersName = PLANT_PROGRAMMER[plant] || "N/D";
    const auditors = PLANT_GROUPS[plant];
    const showArea = (plant === "Planta Exteriores");

    html += `
      <div class="card">
        <div class="card-header">
          <div>
            <h3><i class="fas fa-industry" style="color:var(--accent-color);margin-right:8px;"></i>${plant}</h3>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
              Programador: <b>${programmersName}</b>
            </div>
          </div>
        </div>
        <div class="table-container" style="overflow-x:auto;">
          <table class="assign-table">
            <thead>
              <tr>
                <th style="text-align:left; min-width:180px; position:sticky; left:0; z-index:2; background:#0056b3;">Inspectores</th>
                ${showArea ? '<th style="min-width:90px;">Área</th>' : ''}
                <th style="min-width:80px;">Programador</th>`;

    // Headers por mes: IGP + Area
    for (let m = 1; m <= 12; m++) {
      html += `
                <th colspan="2" style="min-width:300px; text-align:center; border-left:2px solid #003d82;">
                  ${MONTH_NAMES[m]}
                </th>`;
    }

    html += `</tr>
              <tr>
                <th style="position:sticky; left:0; z-index:2; background:#0056b3;"></th>
                ${showArea ? '<th></th>' : ''}
                <th></th>`;

    for (let m = 1; m <= 12; m++) {
      html += `
                <th style="font-size:10px; border-left:2px solid #003d82;">IGP</th>
                <th style="font-size:10px;">Área</th>`;
    }

    html += `</tr>
            </thead>
            <tbody>`;

    auditors.forEach(a => {
      const safeName = a.replace(/'/g, "\\'");
      html += `
              <tr>
                <td style="text-align:left; font-weight:500; position:sticky; left:0; background:white; z-index:1; border-right:1px solid var(--border-color);">${a}</td>
                ${showArea ? `<td style="text-align:center;"><span style="background:#E0F2FE;color:#0369A1;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600;">${AUDITOR_AREA[a] || ''}</span></td>` : ''}
                <td style="text-align:center; font-size:11px; color:var(--text-secondary);">${programmersName}</td>`;

      for (let m = 1; m <= 12; m++) {
        const key = `${a}_${m}`;
        const d = assignmentData[key] || { igp_tema: '', igp_area: '' };
        const temaId = `tema_${plant.replace(/\s/g, '')}_${a.replace(/\s/g, '_')}_${m}`;
        const areaId = `area_${plant.replace(/\s/g, '')}_${a.replace(/\s/g, '_')}_${m}`;

        html += `
                <td style="padding:2px; border-left:2px solid #E2E8F0; min-width:180px;">
                  <input type="text" id="${temaId}" value="${escapeHtml(d.igp_tema)}"
                    class="assign-cell"
                    placeholder="Tema IGP..."
                    onblur="onAssignCellBlur('${safeName}', ${m})"
                    data-inspector="${a}" data-mes="${m}" data-field="tema" />
                </td>
                <td style="padding:2px; min-width:120px;">
                  <input type="text" id="${areaId}" value="${escapeHtml(d.igp_area)}"
                    class="assign-cell"
                    placeholder="Área..."
                    onblur="onAssignCellBlur('${safeName}', ${m})"
                    data-inspector="${a}" data-mes="${m}" data-field="area" />
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
  // Buscar todos los inputs para este inspector+mes
  const allPlants = Object.keys(PLANT_GROUPS);
  let temaVal = '';
  let areaVal = '';

  for (const plant of allPlants) {
    const pId = plant.replace(/\s/g, '');
    const iId = inspector.replace(/\s/g, '_');
    const temaInput = document.getElementById(`tema_${pId}_${iId}_${mes}`);
    const areaInput = document.getElementById(`area_${pId}_${iId}_${mes}`);
    if (temaInput) temaVal = temaInput.value;
    if (areaInput) areaVal = areaInput.value;
  }

  // Actualizar cache
  const key = `${inspector}_${mes}`;
  assignmentData[key] = { igp_tema: temaVal, igp_area: areaVal };

  // Guardar en Supabase
  const ok = await saveAssignment(inspector, currentAssignYear, mes, temaVal, areaVal);
  if (ok) {
    // Feedback visual sutil
    for (const plant of allPlants) {
      const pId = plant.replace(/\s/g, '');
      const iId = inspector.replace(/\s/g, '_');
      const temaInput = document.getElementById(`tema_${pId}_${iId}_${mes}`);
      if (temaInput) {
        temaInput.style.borderColor = '#10B981';
        setTimeout(() => { temaInput.style.borderColor = ''; }, 1000);
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
    const m = parseInt(r["Fecha de Creación"]?.substring(5, 7));
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
