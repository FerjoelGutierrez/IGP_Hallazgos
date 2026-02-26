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
          <thead><tr><th style="text-align:left;">Inspector</th><th>Estado</th></tr></thead>
          <tbody>
            ${activeAuds.map(a => {
              let warn = audCounts[a] === 2
                ? `<span style="font-size:10px;color:#F59E0B;margin-left:6px;font-weight:bold;">
                     <i class="fas fa-exclamation-circle"></i> 2 IGP</span>` : '';
              return `<tr><td style="text-align:left;">${a} ${warn}</td>
                <td><span class="status-pill ${audStats[a].toLowerCase()}">${audStats[a]}</span></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    container.appendChild(card);
  });
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
