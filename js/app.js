// ============================================
// IGP Dashboard – Lógica Principal (App)
// ============================================

let rawData = [];
let filteredData = [];
let editingRowIndex = -1;

// --- NAVIGATION ---
function switchView(viewId, btnElement) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');
  document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  const titles = {
    'dashboard': 'Dashboard General', 'plants': 'Reporte por Planta',
    'details': 'Detalle de Registros', 'assignment': 'Asignación IGP',
    'analysis': 'Análisis Avanzado', 'history': 'Histórico y Backups'
  };
  document.getElementById('page-title').textContent = titles[viewId];

  // Ocultar filtros en vistas que no los necesitan
  const filtersCard = document.getElementById('global-filters-card');
  if (filtersCard) {
    const hideFilters = (viewId === 'assignment' || viewId === 'history');
    filtersCard.style.display = hideFilters ? 'none' : '';
  }

  // Auto-close sidebar on mobile
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}

// --- MOBILE SIDEBAR ---
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

// --- DRAG & DROP & FILES ---
function setupFileHandlers() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName =>
    dropZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false)
  );
  ['dragenter', 'dragover'].forEach(eventName =>
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false)
  );
  ['dragleave', 'drop'].forEach(eventName =>
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false)
  );

  dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files), false);
  fileInput.addEventListener('change', function () { handleFiles(this.files); });
}

function handleFiles(files) {
  if (files.length > 0) {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: 'array', cellDates: true });
      const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      const savedEdits = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

      // Log column names for debugging
      if (json.length > 0) {
        console.log('📋 Columnas del Excel:', Object.keys(json[0]));
      }

      const incomingRecords = json
        .filter(r => {
          const audName = r["Auditor Asignado"] || "";
          return !BLOCKED_AUDITORS_SET.has(audName.toLowerCase().trim());
        })
        .map((r) => {
          const auditor = r["Auditor Asignado"] || '';
          const computedProgrammer = r["Programador"] || getProgrammerFromAuditor(auditor);
          const key = getCompositeKey(r);
          const saved = savedEdits[key];

          return {
            ...r,
            "Programador": computedProgrammer,
            "Estado": saved ? saved.Estado : r["Estado"],
            "Observaciones": saved ? saved.Observaciones : (r['Observaciones'] || '')
          };
        });

      // --- LÓGICA DE ACUMULACIÓN (MERGE) ---
      // Creamos un mapa de los registros existentes por su clave única
      const existingMap = new Map();
      rawData.forEach(r => existingMap.set(getCompositeKey(r), r));

      incomingRecords.forEach(nr => {
        const key = getCompositeKey(nr);
        if (existingMap.has(key)) {
          // Si ya existe, actualizamos los datos básicos pero mantenemos el estado/obs que ya teníamos
          // (Opcional: podrías decidir que el Excel mande sobre el estado si no hay edición guardada)
          const old = existingMap.get(key);
          existingMap.set(key, { ...old, ...nr, "Estado": old.Estado, "Observaciones": old.Observaciones });
        } else {
          // Si es nuevo, lo agregamos
          existingMap.set(key, nr);
        }
      });

      // Convertimos el mapa de vuelta a array y re-asignamos IDs internos
      rawData = Array.from(existingMap.values()).map((r, idx) => ({ ...r, _id: idx }));

      // Guardar en Supabase en segundo plano (saveRecordsToSupabase ya maneja duplicados en BD)
      saveRecordsToSupabase(incomingRecords).then(ok => {
        if (ok) console.log('✅ Sincronizado con Supabase');
      });

      document.getElementById('welcome-screen').classList.add('hidden');
      setTimeout(() => document.getElementById('welcome-screen').style.display = 'none', 500);

      // Guardar en localStorage acumulado
      localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(rawData));
      initDashboard();
    };
    reader.readAsArrayBuffer(files[0]);
  }
}

// --- INIT DASHBOARD ---
function initDashboard() {
  const opts = {
    year: [...new Set(rawData.map(r => {
      const d = r["Fecha de Creación"];
      if (d instanceof Date) return d.getFullYear().toString();
      return typeof d === 'string' ? d.substring(0, 4) : null;
    }))].filter(Boolean).sort(),
    month: [...new Set(rawData.map(r => {
      const d = r["Fecha de Creación"];
      if (d instanceof Date) return MONTH_NAMES[d.getMonth() + 1];
      return (typeof d === 'string' && d.length >= 7) ? MONTH_NAMES[parseInt(d.substring(5, 7))] : null;
    }))].filter(Boolean).sort((a, b) => MONTH_NAMES.indexOf(a) - MONTH_NAMES.indexOf(b)),
    area: [...new Set(rawData.map(r => r["Área"]))].filter(Boolean).sort(),
    type: [...new Set(rawData.map(r => r["Tipo de Auditoría"]))].filter(Boolean).sort(),
    auditor: [...new Set(rawData.map(r => r["Auditor Asignado"]))].filter(Boolean).sort(),
    programmer: [...new Set(rawData.map(r => r["Programador"]))].filter(Boolean).sort()
  };
  ["year", "month", "area", "type", "auditor", "programmer"].forEach(k => createFilter(k, opts[k]));
  updateDashboard();
}

// --- FILTERS UI ---
function createFilter(key, values) {
  const id = 'filter-' + key;
  const container = document.getElementById(id);
  if (!container) return;
  const label = FILTER_LABELS[key] || key;

  container.innerHTML = `
    <div class="filter-wrapper">
      <button class="filter-btn" onclick="toggleFilter('${id}')">
        <span>${label}</span> <i class="fas fa-chevron-down"></i>
      </button>
      <div class="filter-dropdown" id="dropdown-${id}">
        <input type="text" placeholder="Buscar..." class="filter-search" onkeyup="filterOptions('${id}', this.value)">
        <div class="filter-option" onclick="toggleAll('${key}', true)"><b>Todos</b></div>
        <div class="filter-option" onclick="toggleAll('${key}', false)">Ninguno</div>
        <div class="list"></div>
      </div>
    </div>`;

  const list = container.querySelector('.list');
  values.forEach(v => {
    const div = document.createElement('div');
    div.className = 'filter-option filter-item';
    div.dataset.value = (v || '').toLowerCase().trim();
    div.innerHTML = `<input type="checkbox" value="${v}" checked onchange="updateDashboard()"> ${v}`;
    list.appendChild(div);
  });
}

function toggleFilter(id) {
  const dd = document.getElementById('dropdown-' + id);
  document.querySelectorAll('.filter-dropdown').forEach(d => { if (d !== dd) d.classList.remove('show'); });
  dd.classList.toggle('show');
}

function toggleAll(key, state) {
  const container = document.getElementById('filter-' + key);
  if (!container) return;
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = state);
  updateDashboard();
}

function filterOptions(filterId, text) {
  text = text.toLowerCase().trim();
  document.querySelector(`#dropdown-${filterId} .list`).querySelectorAll('.filter-item').forEach(opt => {
    opt.style.display = (opt.dataset.value || '').includes(text) ? 'flex' : 'none';
  });
}

// --- CORE LOGIC ---
function updateDashboard() {
  const filters = {};
  ['year', 'month', 'area', 'type', 'auditor', 'programmer'].forEach(k => {
    const c = document.getElementById('filter-' + k);
    filters[k] = c ? Array.from(c.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value) : [];
  });

  filteredData = rawData.filter(r => {
    const d = r["Fecha de Creación"];
    if (!d) return false;
    
    let y = "";
    let m = "";
    if (d instanceof Date) {
      y = d.getFullYear().toString();
      m = MONTH_NAMES[d.getMonth() + 1];
    } else if (typeof d === 'string' && d.length >= 7) {
      y = d.substring(0, 4);
      m = MONTH_NAMES[parseInt(d.substring(5, 7))];
    }

    if (filters.year.length && !filters.year.includes(y)) return false;
    if (filters.month.length && !filters.month.includes(m)) return false;
    if (filters.area.length && !filters.area.includes(r["Área"])) return false;
    if (filters.type.length && !filters.type.includes(r["Tipo de Auditoría"])) return false;
    if (filters.auditor.length && !filters.auditor.includes(r["Auditor Asignado"])) return false;
    if (filters.programmer.length && !filters.programmer.includes(r["Programador"])) return false;
    return true;
  });

  renderKPIs(filteredData);
  renderCharts(filteredData);
  renderMatrix(filteredData);
  renderDetails(filteredData);
  renderPlantReport(filteredData);
  renderAssignment(); // async, loads its own data from Supabase
  renderAnalysis(filteredData);
  generateDynamicAnalysis(filteredData);
}

// --- CRM MODAL ---
function openCRM(id) {
  editingRowIndex = id;
  const row = rawData.find(r => r._id === id);
  document.getElementById('crm-status').value = getShortStatus(row["Estado"]) === 'ND' ? 'P' : getShortStatus(row["Estado"]);
  document.getElementById('crm-obs').value = row["Observaciones"] || '';
  document.getElementById('crm-modal').style.display = 'flex';
}

function closeModal() { document.getElementById('crm-modal').style.display = 'none'; }

async function saveCRM() {
  const row = rawData.find(r => r._id === editingRowIndex);
  const statusVal = document.getElementById('crm-status').value;
  row["Estado"] = statusVal === 'E' ? 'Ejecutado' : (statusVal === 'EP' ? 'En Proceso' : 'Pendiente');
  row["Observaciones"] = document.getElementById('crm-obs').value;

  const savedEdits = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  savedEdits[getCompositeKey(row)] = { Estado: row["Estado"], Observaciones: row["Observaciones"] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedEdits));

  // Actualizar en Supabase si tiene ID
  if (row._supabase_id) {
    await updateRecordInSupabase(row._supabase_id, row["Estado"], row["Observaciones"]);
  }

  closeModal();
  updateDashboard();
}

// --- EXPORTS ---
function exportToExcel(data) {
  const ws = XLSX.utils.json_to_sheet(data.map(({ _id, _supabase_id, ...r }) => r));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, "IGP_Export.xlsx");
}

function exportTableToPDF(id, title) {
  const doc = new jspdf.jsPDF('l');
  doc.text(title, 14, 15);
  doc.autoTable({
    html: '#' + id + ' table', startY: 20, theme: 'grid',
    headStyles: { fillColor: [15, 23, 42] },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const t = data.cell.raw.innerText;
        if (t === 'E') { data.cell.styles.fillColor = [16, 185, 129]; data.cell.styles.textColor = 255; }
        if (t === 'P') { data.cell.styles.fillColor = [239, 68, 68]; data.cell.styles.textColor = 255; }
        if (t === 'EP') { data.cell.styles.fillColor = [245, 158, 11]; }
      }
    }
  });
  doc.save(title + '.pdf');
}

function exportPlantPDF(plantName) {
  exportTableToPDF('table-plant-' + plantName.replace(/\s/g, ''), 'Reporte_' + plantName);
}

function exportAllPlantsPDF(selectedProgrammer) {
  const plants = selectedProgrammer === 'all'
    ? Object.keys(PLANT_GROUPS)
    : Object.keys(PLANT_PROGRAMMER).filter(p => PLANT_PROGRAMMER[p] === selectedProgrammer);

  if (plants.length === 0) return alert('No hay datos para este programador');

  const doc = new jspdf.jsPDF('p');
  doc.setFontSize(18);
  doc.text(selectedProgrammer === 'all' ? "Reporte Consolidado" : `Reporte - ${selectedProgrammer}`, 14, 15);
  let yPos = 25;

  plants.forEach(plant => {
    const table = document.querySelector('#table-plant-' + plant.replace(/\s/g, '') + ' table');
    if (table) {
      doc.setFontSize(14);
      doc.text(`${plant} (${PLANT_PROGRAMMER[plant] || "N/D"})`, 14, yPos);
      doc.autoTable({
        html: table, startY: yPos + 5, theme: 'grid',
        headStyles: { fillColor: [15, 23, 42] },
        didParseCell: (d) => {
          if (d.section === 'body') {
            const t = d.cell.raw.innerText;
            if (t === 'E') { d.cell.styles.fillColor = [16, 185, 129]; d.cell.styles.textColor = 255; }
            if (t === 'P') { d.cell.styles.fillColor = [239, 68, 68]; d.cell.styles.textColor = 255; }
            if (t === 'EP') { d.cell.styles.fillColor = [245, 158, 11]; }
          }
        }
      });
      yPos = doc.lastAutoTable.finalY + 15;
      if (yPos > 250) { doc.addPage(); yPos = 20; }
    }
  });
  const filename = selectedProgrammer === 'all' ? 'Reporte_Todas_Plantas' : `Reporte_${selectedProgrammer.replace(/\s/g, '_')}`;
  doc.save(filename + '.pdf');
}

function sendEmail(selectedProgrammer) {
  const plantsSortOrder = ["Planta Exteriores", "Planta 1", "Planta 2"];
  const plants = selectedProgrammer === 'all'
    ? plantsSortOrder.filter(p => PLANT_GROUPS[p])
    : Object.keys(PLANT_PROGRAMMER).filter(p => PLANT_PROGRAMMER[p] === selectedProgrammer);

  const now = new Date();
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const currentMonth = monthNames[now.getMonth()];
  const currentYear = now.getFullYear();

  let body = '';

  // --- RESUMEN GENERAL (Solo si es "Todas las Plantas") ---
  if (selectedProgrammer === 'all') {
    const allAuditors = plants.flatMap(p => PLANT_GROUPS[p]);
    const allData = filteredData.filter(r => allAuditors.includes(r["Auditor Asignado"]));
    const allIGPs = allData.filter(r => (r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));
    const allHallazgos = allData.filter(r => !(r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));
    
    // Stats IGPs
    const totI = allIGPs.length;
    const terI = allIGPs.filter(r => (r["Estado"] || '').includes('Terminada')).length;
    const exeI = allIGPs.filter(r => (r["Estado"] || '').includes('En Ejecución')).length;
    const penI = allIGPs.filter(r => (r["Estado"] || '').includes('Pendiente')).length;
    const perI = totI > 0 ? ((terI / totI) * 100).toFixed(1) : 0;

    // Stats Hallazgos
    const totH = allHallazgos.length;
    const terH = allHallazgos.filter(r => (r["Estado"] || '').includes('Terminada')).length;
    const exeH = allHallazgos.filter(r => (r["Estado"] || '').includes('En Ejecución')).length;
    const penH = allHallazgos.filter(r => (r["Estado"] || '').includes('Pendiente')).length;
    const perH = totH > 0 ? ((terH / totH) * 100).toFixed(1) : 0;

    body += `📊 RESUMEN GENERAL DE GESTIÓN - ${currentMonth.toUpperCase()} ${currentYear}\n`;
    body += `--------------------------------------------------\n`;
    body += `🔹 RESUMEN DE IGPs\n`;
    body += `Total IGPs:      ${totI}\n`;
    body += `🟢 Terminadas:   ${terI}\n`;
    body += `🟡 En Ejecución: ${exeI}\n`;
    body += `🔴 Pendientes:   ${penI}\n`;
    body += `📈 Cumplimiento: ${perI}%\n`;
    body += `--------------------------------------------------\n`;
    body += `🔸 RESUMEN DE HALLAZGOS\n`;
    body += `Total Hallazgos: ${totH}\n`;
    body += `🟢 Terminadas:   ${terH}\n`;
    body += `🟡 En Ejecución: ${exeH}\n`;
    body += `🔴 Pendientes:   ${penH}\n`;
    body += `📈 Cumplimiento: ${perH}%\n`;
    body += `--------------------------------------------------\n\n`;
  }

  const plantNamesStr = plants.join(', ').replace(/, ([^,]*)$/, ' y $1');
  body += `Estimados Inspectores - ${plantNamesStr},\n\n`;
  body += `Reciban un cordial saludo.\n\n`;
  body += `Por medio del presente, les adjunto el estado actual de las Inspecciones Generales Planeadas (IGP) dinámicas correspondientes al mes de ${currentMonth.toLowerCase()}. Les recuerdo la importancia de culminar las tareas asignadas dentro de los plazos establecidos.\n\n`;

  plants.forEach(plant => {
    const auditors = PLANT_GROUPS[plant];
    const plantData = filteredData.filter(r => auditors.includes(r["Auditor Asignado"]));
    if (plantData.length === 0) return;

    const prog = PLANT_PROGRAMMER[plant] || 'N/D';
    const isAndres = (prog === 'Andrés Mena');

    body += `ESTADO AVANCE ${currentMonth.toUpperCase()} ${currentYear}\n`;
    body += `IGPs de ${plant === 'Planta Exteriores' ? 'Exteriores' : plant} - ${prog}\n`;
    body += `--------------------------------------------------\n`;

    // --- SECCIÓN IGPs ---
    const igps = plantData.filter(r => (r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));
    if (igps.length > 0) {
      igps.forEach(r => {
        let nameArea = r["Auditor Asignado"] || '';
        if (isAndres && AUDITOR_AREA[nameArea]) nameArea += ` (${AUDITOR_AREA[nameArea]})`;
        
        const shortEst = getShortStatus(r["Estado"]);
        const icon = shortEst === 'E' ? '🟢' : (shortEst === 'EP' ? '🟡' : '🔴');
        const estText = r["Estado"] || 'Pendiente';
        
        body += `${nameArea}: ${estText} ${icon}\n`;
      });
      body += '\n';
    }

    // --- SECCIÓN HALLAZGOS ---
    const hallazgos = plantData.filter(r => !(r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));
    if (hallazgos.length > 0) {
      body += `HALLAZGOS - ${prog}\n`;
      hallazgos.forEach(r => {
        let nameArea = r["Auditor Asignado"] || '';
        if (isAndres && AUDITOR_AREA[nameArea]) nameArea += ` (${AUDITOR_AREA[nameArea]})`;
        
        const shortEst = getShortStatus(r["Estado"]);
        const icon = shortEst === 'E' ? '🟢' : (shortEst === 'EP' ? '🟡' : '🔴');
        const estText = r["Estado"] || 'Pendiente';
        
        body += `${nameArea}: ${estText} ${icon}\n`;
      });
      body += '\n';
    }

    body += `\n`;
  });

  body += `Quedamos atentos a la actualización de los casos.\n\n`;
  body += `Atentamente,\n\n`;
  body += `Seguridad Industrial Vitapro S.A.\n`;

  const subject = selectedProgrammer === 'all' 
    ? `REPORTE DE GESTIÓN IGP & HALLAZGOS – ${currentMonth.toUpperCase()} ${currentYear}`
    : `REPORTE DE GESTIÓN - ${plantNamesStr.toUpperCase()} - ${currentMonth.toUpperCase()} ${currentYear}`;

  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- MODAL DE EXPORTACIÓN ---
function showExportModal(type) {
  // type = 'email' o 'pdf'
  const programmers = [...new Set(Object.values(PLANT_PROGRAMMER))];

  let modal = document.getElementById('export-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'export-modal';
    document.body.appendChild(modal);
  }

  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:white;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <h3 style="margin:0 0 16px 0;font-size:16px;color:var(--primary-color);">
        <i class="fas fa-${type === 'email' ? 'envelope' : 'file-pdf'}" style="color:var(--accent-color);margin-right:8px;"></i>
        ${type === 'email' ? 'Enviar Correo' : 'Descargar PDF'}
      </h3>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px 0;">Selecciona el programador para el reporte:</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button onclick="closeExportModal(); ${type === 'email' ? "sendEmail('all')" : "exportAllPlantsPDF('all')"};"
          style="padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;background:#F8FAFC;cursor:pointer;font-size:13px;font-weight:600;text-align:left;transition:all 0.2s;"
          onmouseover="this.style.background='#E0F2FE'" onmouseout="this.style.background='#F8FAFC'">
          <i class="fas fa-globe" style="margin-right:8px;color:var(--accent-color);"></i> Todos los Programadores
        </button>
        ${programmers.map(p => `
        <button onclick="closeExportModal(); ${type === 'email' ? `sendEmail('${p}')` : `exportAllPlantsPDF('${p}')`};"
          style="padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;background:#F8FAFC;cursor:pointer;font-size:13px;font-weight:500;text-align:left;transition:all 0.2s;"
          onmouseover="this.style.background='#E0F2FE'" onmouseout="this.style.background='#F8FAFC'">
          <i class="fas fa-user" style="margin-right:8px;color:#64748B;"></i> ${p}
          <span style="font-size:11px;color:#94A3B8;margin-left:4px;">
            (${Object.keys(PLANT_PROGRAMMER).find(plant => PLANT_PROGRAMMER[plant] === p) || ''})
          </span>
        </button>`).join('')}
      </div>
      <button onclick="closeExportModal()"
        style="margin-top:16px;width:100%;padding:10px;border:none;border-radius:8px;background:#F1F5F9;cursor:pointer;font-size:12px;color:#64748B;">
        Cancelar
      </button>
    </div>`;
}

function closeExportModal() {
  const modal = document.getElementById('export-modal');
  if (modal) modal.remove();
}

function generateHistoryReport() {
  const m = document.getElementById('hist-month').value;
  const y = document.getElementById('hist-year').value;

  if (!m) return alert("Por favor seleccione un mes");

  const histData = rawData.filter(r => {
    const d = r["Fecha de Creación"];
    if (!d) return false;
    
    let mes = "";
    let year = "";

    if (d instanceof Date) {
      mes = MONTH_NAMES[d.getMonth() + 1];
      year = d.getFullYear().toString();
    } else if (typeof d === 'string' && d.length >= 7) {
      year = d.substring(0, 4);
      mes = MONTH_NAMES[parseInt(d.substring(5, 7))];
    }

    return year === y && mes === m;
  });

  if (histData.length === 0) return alert(`No se encontraron datos para ${m} ${y}`);

  const doc = new jspdf.jsPDF('l', 'mm', 'a4');
  
  // Header
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // Navy Blue
  doc.text(`REPORTE DETALLADO IGP - ${m.toUpperCase()} ${y}`, 14, 20);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generado el: ${new Date().toLocaleString()}`, 14, 28);
  doc.text(`Total de registros: ${histData.length}`, 14, 33);

  // Table
  const columns = [
    { header: 'Inspector', dataKey: 'auditor' },
    { header: 'Área/Planta', dataKey: 'planta' },
    { header: 'Departamento', dataKey: 'depto' },
    { header: 'Tipo de Auditoría', dataKey: 'tipo' },
    { header: 'Unidad', dataKey: 'unidad' },
    { header: 'Fecha', dataKey: 'fecha' },
    { header: 'Estado', dataKey: 'estado' },
    { header: 'Observaciones', dataKey: 'obs' }
  ];

  const body = histData.map(r => {
    let depto = r["Departamento"] || '';
    if (!depto) {
      const deptoKey = Object.keys(r).find(k => k.toLowerCase().includes('depto') || k.toLowerCase().includes('departamento'));
      if (deptoKey) depto = r[deptoKey] || '';
    }

    return {
      auditor: r["Auditor Asignado"] || 'N/D',
      planta: getPlantFromAuditor(r["Auditor Asignado"]),
      depto: depto,
      tipo: r["Tipo de Auditoría"] || 'N/D',
      unidad: r["Unidad"] || '',
      fecha: r["Fecha de Creación"] instanceof Date ? r["Fecha de Creación"].toLocaleDateString() : (r["Fecha de Creación"] || ''),
      estado: r["Estado"] || 'Pendiente',
      obs: r["Observaciones"] || ''
    };
  });

  doc.autoTable({
    columns: columns,
    body: body,
    startY: 40,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 10, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      obs: { cellWidth: 40 },
      tipo: { cellWidth: 40 },
      auditor: { cellWidth: 35 }
    },
    didParseCell: (data) => {
      if (data.column.dataKey === 'estado' && data.section === 'body') {
        const s = getShortStatus(data.cell.raw);
        if (s === 'E') { data.cell.styles.textColor = [16, 185, 129]; data.cell.styles.fontStyle = 'bold'; }
        if (s === 'P') { data.cell.styles.textColor = [239, 68, 68]; data.cell.styles.fontStyle = 'bold'; }
        if (s === 'EP') { data.cell.styles.textColor = [245, 158, 11]; data.cell.styles.fontStyle = 'bold'; }
      }
    }
  });

  doc.save(`Reporte_Detallado_IGP_${m}_${y}.pdf`);
}

async function clearSavedData() {
  if (confirm('¿Borrar datos?')) {
    localStorage.removeItem(STORAGE_DATA_KEY);
    localStorage.removeItem(STORAGE_KEY);
    await deleteAllRecordsFromSupabase();
    location.reload();
  }
}

// --- APP INIT ---
window.addEventListener('DOMContentLoaded', async () => {
  setupFileHandlers();

  // Mostrar indicador de carga
  const welcomeScreen = document.getElementById('welcome-screen');
  const loadingMsg = document.createElement('p');
  loadingMsg.style.cssText = 'color:rgba(255,255,255,0.6); margin-top:20px; font-size:14px;';
  loadingMsg.textContent = '⏳ Buscando datos guardados...';
  welcomeScreen.appendChild(loadingMsg);

  let dataLoaded = false;

  // 1. Intentar cargar de Supabase
  try {
    const sb = getSupabase();
    if (sb) {
      loadingMsg.textContent = '☁️ Conectando con Supabase...';
      const supaData = await loadRecordsFromSupabase();
      if (supaData && supaData.length > 0) {
        rawData = supaData;
        dataLoaded = true;
        // Actualizar localStorage como backup
        localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(rawData));
        console.log(`✅ ${rawData.length} registros cargados de Supabase`);
        loadingMsg.textContent = `✅ ${rawData.length} registros cargados de la nube`;
      } else {
        console.log('ℹ️ No hay datos en Supabase');
        loadingMsg.textContent = 'ℹ️ No hay datos en Supabase, buscando localmente...';
      }
    }
  } catch (err) {
    console.warn('⚠️ Error conectando con Supabase:', err);
    loadingMsg.textContent = '⚠️ Error de conexión, buscando datos locales...';
  }

  // 2. Fallback: localStorage
  if (!dataLoaded) {
    try {
      const savedData = localStorage.getItem(STORAGE_DATA_KEY);
      if (savedData) {
        const temp = JSON.parse(savedData);
        if (temp && temp.length > 0) {
          rawData = temp
            .filter(r => r["Auditor Asignado"] && !BLOCKED_AUDITORS_SET.has(r["Auditor Asignado"].toLowerCase().trim()))
            .map((r, i) => {
              if (!r["Programador"]) r["Programador"] = getProgrammerFromAuditor(r["Auditor Asignado"] || '');
              r._id = (typeof r._id === 'number') ? r._id : i;
              return r;
            });
          dataLoaded = true;
          console.log(`✅ ${rawData.length} registros cargados de localStorage`);
          loadingMsg.textContent = `✅ ${rawData.length} registros cargados localmente`;

          // Intentar sincronizar con Supabase en segundo plano
          saveRecordsToSupabase(rawData).then(ok => {
            if (ok) console.log('☁️ Datos locales sincronizados con Supabase');
          });
        }
      }
    } catch (e) {
      console.error('Error cargando de localStorage:', e);
    }
  }

  // 3. Mostrar dashboard o welcome screen
  if (dataLoaded && rawData.length > 0) {
    welcomeScreen.classList.add('hidden');
    setTimeout(() => { welcomeScreen.style.display = 'none'; }, 500);
    initDashboard();
  } else {
    loadingMsg.textContent = 'No hay datos guardados. Sube un archivo Excel para comenzar.';
  }
});
