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
      
      let allRows = [];
      workbook.SheetNames.forEach(name => {
        const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[name]);
        if (sheetRows.length > 0) allRows = allRows.concat(sheetRows);
      });

      if (allRows.length === 0) return alert("El archivo no tiene datos válidos");

      const incomingRecords = allRows
        .filter(r => {
          // Buscar columna "Auditor Asignado" sin importar mayúsculas
          const keys = Object.keys(r);
          const audKey = keys.find(k => k.toLowerCase().includes('auditor')) || "Auditor Asignado";
          const a = (r[audKey] || "").toString().toLowerCase().trim();
          return a && !BLOCKED_AUDITORS_SET.has(a);
        })
        .map(r => {
          const keys = Object.keys(r);
          // Helper: buscar columna por nombre parcial (case-insensitive)
          const findCol = (...terms) => {
            for (const term of terms) {
              const found = keys.find(k => k.toLowerCase().includes(term.toLowerCase()));
              if (found) return r[found] || '';
            }
            return '';
          };

          const auditor = findCol('auditor').toString().trim();
          const area = findCol('área', 'area').toString().trim();
          const unidad = findCol('unidad').toString().trim();
          const tipo = findCol('tipo de auditor', 'tipo auditor').toString().trim();
          const depto = findCol('departamento', 'depto', 'ubicación').toString().trim();
          const estado = findCol('estado').toString().trim() || 'Pendiente';
          const obs = findCol('observacion').toString().trim();

          let fecha = findCol('fecha de creación', 'fecha creación', 'fecha');
          if (typeof fecha === 'string' && fecha.includes('/')) {
             const parts = fecha.split('/');
             if (parts.length === 3) fecha = new Date(parts[2], parts[1]-1, parts[0]);
          }

          return {
            ...r,
            "Auditor Asignado": auditor,
            "Área": area,
            "Unidad": unidad,
            "Departamento": depto,
            "Tipo de Auditoría": tipo,
            "Fecha de Creación": fecha,
            "Estado": estado,
            "Observaciones": obs,
            "Programador": r["Programador"] || findCol('programador').toString().trim() || getProgrammerFromAuditor(auditor)
          };
        });

      // --- DEDUPLICACIÓN INTELIGENTE ---
      // Crear mapa de lo existente (clave = fecha+auditor+area+unidad)
      const existingMap = new Map();
      rawData.forEach(r => existingMap.set(getCompositeKey(r), r));

      let updated = 0;
      let added = 0;

      // Para cada registro del Excel:
      // - Si ya existe en rawData → solo actualizar el estado
      // - Si no existe → agregarlo
      incomingRecords.forEach(r => {
        const key = getCompositeKey(r);
        const existing = existingMap.get(key);
        
        if (existing) {
          // Ya existe → actualizar estado y observaciones
          existing["Estado"] = r["Estado"] || existing["Estado"];
          existing["Observaciones"] = r["Observaciones"] || existing["Observaciones"];
          existingMap.set(key, existing);
          updated++;
        } else {
          // No existe → agregar como nuevo
          existingMap.set(key, r);
          added++;
        }
      });

      rawData = Array.from(existingMap.values()).map((r, i) => ({ ...r, _id: i }));

      // Guardar localStorage
      localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(rawData));
      
      // Sincronizar con Supabase en segundo plano
      saveRecordsToSupabase(incomingRecords);

      // --- ACTIVAR FILTROS ---
      document.querySelectorAll('.filter-dropdown input[type="checkbox"]').forEach(cb => cb.checked = true);
      
      document.getElementById('welcome-screen').style.display = 'none';
      initDashboard();
      updateDashboard();
      alert(`✅ Procesado: ${added} nuevos, ${updated} actualizados. Total: ${rawData.length} registros.`);
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
  const icons = {
    year: 'fas fa-calendar-alt',
    month: 'far fa-calendar',
    area: 'fas fa-layer-group',
    type: 'fas fa-shield-alt',
    auditor: 'fas fa-user-tie',
    programmer: 'fas fa-user-cog'
  };
  const iconClass = icons[key] || 'fas fa-filter';

  container.innerHTML = `
    <div class="filter-wrapper">
      <button class="filter-btn" onclick="toggleFilter('${id}')">
        <span><i class="${iconClass}" style="margin-right:6px;font-size:12px;"></i> ${label}</span> 
        <i class="fas fa-chevron-down" style="font-size:10px;"></i>
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
  renderIGPTypeAnalysis(filteredData);
  renderPuntajeAnalysis(filteredData);
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
        const t = (data.cell.raw.innerText || '').trim();
        if (t === 'E') { data.cell.styles.fillColor = [16, 185, 129]; data.cell.styles.textColor = 255; }
        else if (t === 'P') { data.cell.styles.fillColor = [239, 68, 68]; data.cell.styles.textColor = 255; }
        else if (t === 'EP') { data.cell.styles.fillColor = [245, 158, 11]; }
        // Si hay múltiples estados (ej: "E P"), no aplicamos color de fondo para no confundir
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

  const now = new Date();
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const doc = new jspdf.jsPDF('p', 'mm', 'a4');
  
  // Header
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.setFont(undefined, 'bold');
  doc.text(selectedProgrammer === 'all' ? "REPORTE CONSOLIDADO IGP" : `REPORTE - ${selectedProgrammer.toUpperCase()}`, 14, 18);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(100);
  doc.text(`Generado: ${now.toLocaleDateString()} ${now.toLocaleTimeString()} · Registros filtrados: ${filteredData.length}`, 14, 25);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(14, 28, 196, 28);

  let yPos = 35;

  plants.forEach(plant => {
    const auditors = PLANT_GROUPS[plant];
    const plantData = filteredData.filter(r => auditors.includes(r["Auditor Asignado"]));
    if (plantData.length === 0) return;

    const prog = PLANT_PROGRAMMER[plant] || 'N/D';
    const ej = plantData.filter(r => getShortStatus(r["Estado"]) === 'E').length;
    const pend = plantData.filter(r => getShortStatus(r["Estado"]) === 'P').length;
    const ep = plantData.filter(r => getShortStatus(r["Estado"]) === 'EP').length;
    const pct = plantData.length > 0 ? ((ej / plantData.length) * 100).toFixed(1) : 0;

    if (yPos > 240) { doc.addPage(); yPos = 20; }

    // Plant header
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.setFont(undefined, 'bold');
    doc.text(`${plant} — ${prog}`, 14, yPos);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(80);
    doc.text(`Total: ${plantData.length} | Ejecutadas: ${ej} | Pendientes: ${pend} | En Proceso: ${ep} | Cumplimiento: ${pct}%`, 14, yPos + 5);
    yPos += 9;

    // Table from data
    const showArea = (plant === "Planta Exteriores");
    const headers = showArea 
      ? [['Inspector', 'Área', 'Tipo', 'Departamento', 'Estado']]
      : [['Inspector', 'Tipo', 'Departamento', 'Estado']];

    const rows = plantData.map(r => {
      const estado = r["Estado"] || 'Pendiente';
      const row = showArea 
        ? [r["Auditor Asignado"] || '', AUDITOR_AREA[r["Auditor Asignado"]] || '', r["Tipo de Auditoría"] || '', r["Departamento"] || '', estado]
        : [r["Auditor Asignado"] || '', r["Tipo de Auditoría"] || '', r["Departamento"] || '', estado];
      return row;
    });

    doc.autoTable({
      startY: yPos,
      head: headers,
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 2 },
      didParseCell: (d) => {
        const colIdx = showArea ? 4 : 3;
        if (d.column.index === colIdx && d.section === 'body') {
          const s = getShortStatus(d.cell.raw || '');
          if (s === 'E') { d.cell.styles.textColor = [16, 185, 129]; d.cell.styles.fontStyle = 'bold'; }
          else if (s === 'P') { d.cell.styles.textColor = [239, 68, 68]; d.cell.styles.fontStyle = 'bold'; }
          else if (s === 'EP') { d.cell.styles.textColor = [245, 158, 11]; d.cell.styles.fontStyle = 'bold'; }
        }
      }
    });

    yPos = doc.lastAutoTable.finalY + 12;
  });

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${pageCount} — IGP Dashboard Vitapro`, 14, 288);
  }

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
    } else if (typeof d === 'string') {
      if (d.includes('-')) {
        year = d.split('-')[0];
        mes = MONTH_NAMES[parseInt(d.split('-')[1])];
      } else if (d.includes('/')) {
        year = d.split('/')[2];
        mes = MONTH_NAMES[parseInt(d.split('/')[1])];
      }
    }
    return year === y && mes === m;
  });

  if (histData.length === 0) return alert(`No se encontraron datos para ${m} ${y}`);

  const doc = new jspdf.jsPDF('p', 'mm', 'a4');
  
  // --- HEADER PRINCIPAL ---
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // Navy
  doc.setFont(undefined, 'bold');
  doc.text("INFORME DE GESTIÓN IGP & HALLAZGOS", 14, 20);
  
  doc.setFontSize(14);
  doc.setTextColor(100);
  doc.setFont(undefined, 'normal');
  doc.text(`PERIODO: ${m.toUpperCase()} ${y}`, 14, 28);
  
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${new Date().toLocaleString()}`, 14, 34);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(14, 36, 196, 36);

  // --- CÁLCULO DE ESTADÍSTICAS (KPIs) ---
  const igps = histData.filter(r => (r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));
  const hallazgos = histData.filter(r => !(r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));

  const getStats = (list) => {
    const tot = list.length;
    const ej = list.filter(r => getShortStatus(r.Estado) === 'E').length;
    const pen = list.filter(r => getShortStatus(r.Estado) === 'P').length;
    const prox = list.filter(r => getShortStatus(r.Estado) === 'EP').length;
    const pct = tot > 0 ? ((ej / tot) * 100).toFixed(1) : 0;
    return { tot, ej, pen, prox, pct };
  };

  const sI = getStats(igps);
  const sH = getStats(hallazgos);

  // --- CUADROS DE RESUMEN ---
  // Estilo Cajas
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 42, 88, 48, 3, 3, 'FD'); // Caja IGP
  doc.roundedRect(108, 42, 88, 48, 3, 3, 'FD'); // Caja Hallazgos

  // Textos IGP
  doc.setFontSize(11); doc.setTextColor(15, 23, 42); doc.setFont(undefined, 'bold');
  doc.text("RESUMEN DE IGPs", 18, 48);
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Total Programadas: ${sI.tot}`, 18, 56);
  doc.setTextColor(16, 185, 129); doc.text(`🟢 Terminadas / Ejecutadas: ${sI.ej}`, 18, 62);
  doc.setTextColor(245, 158, 11); doc.text(`🟡 En Ejecución / Proceso: ${sI.prox}`, 18, 68);
  doc.setTextColor(239, 68, 68); doc.text(`🔴 Pendientes: ${sI.pen}`, 18, 74);
  doc.setTextColor(15, 23, 42); doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text(`CUMPLIMIENTO: ${sI.pct}%`, 18, 83);

  // Textos Hallazgos
  doc.setFontSize(11); doc.setTextColor(15, 23, 42); doc.setFont(undefined, 'bold');
  doc.text("RESUMEN DE HALLAZGOS", 112, 48);
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Total Reportados: ${sH.tot}`, 112, 56);
  doc.setTextColor(16, 185, 129); doc.text(`🟢 Terminadas / Ejecutadas: ${sH.ej}`, 112, 62);
  doc.setTextColor(245, 158, 11); doc.text(`🟡 En Ejecución / Proceso: ${sH.prox}`, 112, 68);
  doc.setTextColor(239, 68, 68); doc.text(`🔴 Pendientes: ${sH.pen}`, 112, 74);
  doc.setTextColor(15, 23, 42); doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text(`CUMPLIMIENTO: ${sH.pct}%`, 112, 83);

  // --- TABLAS DETALLADAS ---
  let yPos = 100;

  const renderTable = (title, data, headerColor) => {
    if (data.length === 0) return;
    
    // Si la tabla no cabe en la página actual
    if (yPos > 240) { doc.addPage(); yPos = 20; }

    doc.setFontSize(13);
    doc.setTextColor(headerColor[0], headerColor[1], headerColor[2]);
    doc.setFont(undefined, 'bold');
    doc.text(title, 14, yPos);
    yPos += 4;

    doc.autoTable({
      startY: yPos,
      head: [['Inspector', 'Planta', 'Departamento', 'Estado', 'Observaciones']],
      body: data.map(r => [
        r["Auditor Asignado"] || 'N/D',
        getPlantFromAuditor(r["Auditor Asignado"]),
        r["Departamento"] || 'N/D',
        r["Estado"] || 'Pendiente',
        r["Observaciones"] || ''
      ]),
      theme: 'grid',
      headStyles: { fillColor: headerColor, textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        4: { cellWidth: 55 } // Ancho para observaciones
      },
      didParseCell: (d) => {
        if (d.column.index === 3 && d.section === 'body') {
          const s = getShortStatus((d.cell.raw.innerText || '').trim());
          if (s === 'E') { d.cell.styles.textColor = [16, 185, 129]; d.cell.styles.fontStyle = 'bold'; }
          else if (s === 'P') { d.cell.styles.textColor = [239, 68, 68]; d.cell.styles.fontStyle = 'bold'; }
          else if (s === 'EP') { d.cell.styles.textColor = [245, 158, 11]; d.cell.styles.fontStyle = 'bold'; }
        }
      }
    });

    yPos = doc.lastAutoTable.finalY + 15;
  };

  renderTable("DETALLES DE INSPECCIONES (IGP)", igps, [15, 23, 42]);
  renderTable("DETALLES DE HALLAZGOS / ACCIONES", hallazgos, [239, 68, 68]);

  // Pie de página
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${pageCount} - IGP Dashboard Vitapro`, 14, 285);
  }

  doc.save(`Informe_Gestion_IGP_${m}_${y}.pdf`);
}

async function clearSavedData() {
  if (confirm('¿Borrar datos?')) {
    localStorage.removeItem(STORAGE_DATA_KEY);
    localStorage.removeItem(STORAGE_KEY);
    await deleteAllRecordsFromSupabase();
    location.reload();
  }
}

// --- DEDUPLICAR DATOS ---
function deduplicateRawData() {
  const map = new Map();
  rawData.forEach(r => {
    const key = getCompositeKey(r);
    const existing = map.get(key);
    if (existing) {
      // Si hay duplicado, mantener el que tenga estado más avanzado
      const oldStatus = getShortStatus(existing["Estado"]);
      const newStatus = getShortStatus(r["Estado"]);
      const priority = { 'E': 3, 'EP': 2, 'P': 1, 'ND': 0 };
      if ((priority[newStatus] || 0) >= (priority[oldStatus] || 0)) {
        map.set(key, r);
      }
    } else {
      map.set(key, r);
    }
  });
  const before = rawData.length;
  rawData = Array.from(map.values()).map((r, i) => ({ ...r, _id: i }));
  const removed = before - rawData.length;
  if (removed > 0) {
    console.log(`🧹 Deduplicación: ${removed} registros duplicados eliminados. Quedan: ${rawData.length}`);
    localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(rawData));
  }
}

// --- INSTRUCTIVO DINÁMICO ---
function showOnboarding() {
  const steps = [
    {
      title: '👋 ¡Bienvenido al Dashboard IGP!',
      text: 'Este sistema te permite gestionar y analizar las Inspecciones Generales Programadas (IGP) y Hallazgos de Vitapro.',
      icon: 'fas fa-hand-sparkles'
    },
    {
      title: '📤 Paso 1: Cargar Excel',
      text: 'Haz clic en <b>"Cargar Excel"</b> en la barra superior o arrastra tu archivo al centro. El sistema analizará automáticamente los datos y detectará duplicados.',
      icon: 'fas fa-file-excel'
    },
    {
      title: '📊 Paso 2: Dashboard General',
      text: 'Verás KPIs de cumplimiento, gráficos de evolución mensual, distribución de estados y comparativa por planta. Usa los <b>filtros</b> de arriba para segmentar por año, mes, área, tipo, inspector o programador.',
      icon: 'fas fa-chart-bar'
    },
    {
      title: '🏭 Paso 3: Reporte por Planta',
      text: 'En el menú lateral, haz clic en <b>"Reporte por Planta"</b> para ver el detalle de cada planta (Exteriores, Planta 1, Planta 2) con sus inspectores y estados.',
      icon: 'fas fa-industry'
    },
    {
      title: '📋 Paso 4: Asignación IGP',
      text: 'En <b>"Asignación IGP"</b> puedes ver y editar las asignaciones mensuales de cada inspector. Las celdas son editables y se guardan automáticamente.',
      icon: 'fas fa-clipboard-list'
    },
    {
      title: '🔍 Paso 5: Análisis Avanzado',
      text: 'Accede a análisis de cumplimiento por tipo de IGP, puntaje de cierre y ranking de auditores.',
      icon: 'fas fa-search-dollar'
    },
    {
      title: '✉️ Exportar y Compartir',
      text: 'Usa los botones <b>"Enviar Correo"</b>, <b>"PDF"</b> o <b>"Imprimir"</b> para compartir reportes con tu equipo.',
      icon: 'fas fa-share-alt'
    },
    {
      title: '🔄 Re-subir datos actualizados',
      text: 'Si subes el mismo Excel actualizado, el sistema <b>NO duplicará</b> los registros. Solo actualizará los estados (Pendiente → Terminado, etc.).',
      icon: 'fas fa-sync-alt'
    }
  ];

  let currentStep = 0;

  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';

  function renderStep() {
    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;
    const isFirst = currentStep === 0;
    overlay.innerHTML = `
      <div style="background:white;border-radius:16px;padding:32px;max-width:480px;width:90%;box-shadow:0 24px 80px rgba(0,0,0,0.4);animation:fadeIn 0.3s ease;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#0EA5E9,#3B82F6);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <i class="${step.icon}" style="font-size:28px;color:white;"></i>
          </div>
          <h3 style="color:#0F172A;margin:0 0 8px 0;font-size:18px;">${step.title}</h3>
          <p style="color:#64748B;font-size:14px;line-height:1.6;margin:0;">${step.text}</p>
        </div>
        <div style="display:flex;justify-content:center;gap:6px;margin-bottom:20px;">
          ${steps.map((_, i) => `<div style="width:${i === currentStep ? '24px' : '8px'};height:8px;border-radius:4px;background:${i === currentStep ? '#3B82F6' : '#E2E8F0'};transition:all 0.3s;"></div>`).join('')}
        </div>
        <div style="display:flex;gap:10px;justify-content:center;">
          ${!isFirst ? '<button onclick="onboardingPrev()" style="padding:10px 20px;border:1px solid #E2E8F0;border-radius:8px;background:white;cursor:pointer;font-size:13px;color:#64748B;">← Anterior</button>' : ''}
          <button onclick="${isLast ? 'closeOnboarding()' : 'onboardingNext()'}" style="padding:10px 24px;border:none;border-radius:8px;background:linear-gradient(135deg,#0EA5E9,#3B82F6);color:white;cursor:pointer;font-size:13px;font-weight:600;">
            ${isLast ? '🚀 ¡Comenzar!' : 'Siguiente →'}
          </button>
        </div>
        <div style="text-align:center;margin-top:12px;">
          <button onclick="closeOnboarding()" style="border:none;background:none;color:#94A3B8;cursor:pointer;font-size:11px;">Saltar tutorial</button>
        </div>
      </div>
    `;
  }

  window.onboardingNext = () => { currentStep++; renderStep(); };
  window.onboardingPrev = () => { currentStep--; renderStep(); };
  window.closeOnboarding = () => {
    overlay.remove();
    localStorage.setItem('IGP_Onboarding_Done', 'true');
  };

  renderStep();
  document.body.appendChild(overlay);
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
        deduplicateRawData(); // ← LIMPIAR DUPLICADOS
        dataLoaded = true;
        localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(rawData));
        console.log(`✅ ${rawData.length} registros cargados de Supabase (deduplicados)`);
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
          deduplicateRawData(); // ← LIMPIAR DUPLICADOS
          dataLoaded = true;
          console.log(`✅ ${rawData.length} registros cargados de localStorage (deduplicados)`);
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
    rawData.forEach(r => {
      const configProg = getProgrammerFromAuditor(r["Auditor Asignado"] || '');
      if (configProg !== 'N/D') r["Programador"] = configProg;
    });
    welcomeScreen.classList.add('hidden');
    setTimeout(() => { welcomeScreen.style.display = 'none'; }, 500);
    initDashboard();
  } else {
    loadingMsg.textContent = 'No hay datos guardados. Sube un archivo Excel para comenzar.';
    // Mostrar instructivo si es primera vez
    if (!localStorage.getItem('IGP_Onboarding_Done')) {
      setTimeout(() => showOnboarding(), 1000);
    }
  }
});
