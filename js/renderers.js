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
    const audTypeCounts = {}; // { auditor: { igp: N, hallazgo: N } }

    auditors.forEach(a => {
      const recs = plantData.filter(r => r["Auditor Asignado"] === a);
      if (recs.length > 0) {
        audCounts[a] = recs.length;
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
              // Construir badges por tipo
              const tc = audTypeCounts[a] || { igp: 0, hallazgo: 0 };
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
                ? `<td><span style="background:#E0F2FE;color:#0369A1;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;">${AUDITOR_AREA[a] || 'N/D'}</span></td>`
                : '';
              return `<tr><td style="text-align:left;">${a} ${badges}</td>
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
      const tipo = r["Tipo de Auditoría"] || '';
      // SOLO incluir registros que empiezan con "IGP"
      if (!isIGPType(tipo)) return;

      const fecha = r["Fecha de Creación"] || '';
      if (fecha.length < 7) return;
      const year = parseInt(fecha.substring(0, 4));
      if (year !== currentAssignYear) return;
      const mes = parseInt(fecha.substring(5, 7));
      const inspector = r["Auditor Asignado"] || '';
      if (!inspector) return;

      const key = `${inspector}_${mes}`;
      // Buscar Departamento con variaciones de nombre de columna
      let depto = r["Departamento"] || '';
      if (!depto) {
        // Intentar variaciones del nombre de columna del Excel
        const keys = Object.keys(r);
        const deptoKey = keys.find(k => k.toLowerCase().startsWith('departam'));
        if (deptoKey) depto = r[deptoKey] || '';
      }

      if (!autoAssignments[key]) {
        autoAssignments[key] = { igp_tema: tipo, igp_depto: depto };
      } else {
        if (tipo && !autoAssignments[key].igp_tema.includes(tipo)) {
          autoAssignments[key].igp_tema += '\n' + tipo;
        }
        if (depto && !autoAssignments[key].igp_depto.includes(depto)) {
          autoAssignments[key].igp_depto += '\n' + depto;
        }
      }
    });
  }

  // 2. Cargar asignaciones guardadas desde Supabase/localStorage
  const savedAssignments = await loadAssignments(currentAssignYear);
  assignmentData = {};

  // Poner las auto-generadas del Excel
  Object.keys(autoAssignments).forEach(key => {
    assignmentData[key] = autoAssignments[key];
  });

  // Las guardadas sobreescriben (si el usuario las editó manualmente)
  savedAssignments.forEach(a => {
    const key = `${a.inspector}_${a.mes}`;
    if (a.igp_tema || a.igp_area) {
      assignmentData[key] = {
        igp_tema: a.igp_tema || '',
        igp_depto: a.igp_area || ''
      };
    }
  });

  // 3. Auto-guardar las asignaciones del Excel para que persistan
  for (const key of Object.keys(autoAssignments)) {
    const savedKey = savedAssignments.find(s => `${s.inspector}_${s.mes}` === key);
    if (!savedKey) {
      const [inspector, mesStr] = key.split(/_(\d+)$/);
      const mes = parseInt(mesStr);
      if (inspector && mes) {
        saveAssignment(inspector, currentAssignYear, mes,
          autoAssignments[key].igp_tema, autoAssignments[key].igp_depto);
      }
    }
  }

  // 4. Renderizar tabla
  let html = `
    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex; align-items:center; gap:12px; padding:4px 0; flex-wrap:wrap;">
        <label style="font-weight:600; font-size:13px;">Año:</label>
        <select id="assign-year-select" onchange="changeAssignYear(this.value)"
          style="padding:6px 14px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:13px; font-weight:600;">
          <option value="2024" ${currentAssignYear === 2024 ? 'selected' : ''}>2024</option>
          <option value="2025" ${currentAssignYear === 2025 ? 'selected' : ''}>2025</option>
          <option value="2026" ${currentAssignYear === 2026 ? 'selected' : ''}>2026</option>
        </select>
        <span style="font-size:11px; color:var(--text-secondary);">
          <i class="fas fa-info-circle"></i> Solo muestra IGP (no hallazgos). Celdas editables, se guardan al salir.
        </span>
      </div>
    </div>`;

  Object.keys(PLANT_GROUPS).forEach(plant => {
    const programmersName = PLANT_PROGRAMMER[plant] || "N/D";
    const auditors = PLANT_GROUPS[plant];
    const showArea = (plant === "Planta Exteriores");

    html += `
      <div class="card">
        <div class="card-header" style="margin-bottom:8px; padding-bottom:6px;">
          <div>
            <h3 style="font-size:14px;"><i class="fas fa-industry" style="color:var(--accent-color);margin-right:6px;"></i>${plant}</h3>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Programador: <b>${programmersName}</b></div>
          </div>
        </div>
        <div class="table-container" style="overflow-x:auto;">
          <table class="assign-table">
            <thead>
              <tr>
                <th style="text-align:left; min-width:140px; position:sticky; left:0; z-index:2; background:#0056b3;">Inspectores</th>
                ${showArea ? '<th style="min-width:70px;">Área</th>' : ''}
                <th style="min-width:70px;">Prog.</th>`;

    for (let m = 1; m <= 12; m++) {
      html += `<th colspan="2" style="min-width:250px; text-align:center; border-left:2px solid #003d82;">${MONTH_NAMES[m]}</th>`;
    }

    html += `</tr><tr>
                <th style="position:sticky; left:0; z-index:2; background:#0056b3;"></th>
                ${showArea ? '<th></th>' : ''}
                <th></th>`;

    for (let m = 1; m <= 12; m++) {
      html += `<th style="font-size:9px; border-left:2px solid #003d82;">IGP</th>
               <th style="font-size:9px;">Depto</th>`;
    }

    html += `</tr></thead><tbody>`;

    auditors.forEach(a => {
      const safeName = a.replace(/'/g, "\\'");
      html += `<tr>
        <td style="text-align:left; font-weight:500; font-size:11px; position:sticky; left:0; background:white; z-index:1; border-right:1px solid var(--border-color); white-space:nowrap;">${a}</td>
        ${showArea ? `<td style="text-align:center;"><span style="background:#E0F2FE;color:#0369A1;padding:2px 6px;border-radius:8px;font-size:9px;font-weight:600;">${AUDITOR_AREA[a] || ''}</span></td>` : ''}
        <td style="text-align:center; font-size:10px; color:var(--text-secondary);">${programmersName}</td>`;

      for (let m = 1; m <= 12; m++) {
        const key = `${a}_${m}`;
        const d = assignmentData[key] || { igp_tema: '', igp_depto: '' };
        const temaId = `tema_${plant.replace(/\s/g, '')}_${a.replace(/\s/g, '_')}_${m}`;
        const deptoId = `depto_${plant.replace(/\s/g, '')}_${a.replace(/\s/g, '_')}_${m}`;

        html += `<td class="assign-td" style="border-left:2px solid #E2E8F0;">
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
