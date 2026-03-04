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

      // Preguntar si desea limpiar todo (para evitar el error de los 401 duplicados)
      const clearBefore = confirm("¿Desea REEMPLAZAR todos los datos actuales con los de este archivo?\n\n(Aceptar = Limpieza total, Cancelar = Solo sumar lo nuevo)");

      const incomingRecords = allRows
        .filter(r => {
          const a = (r["Auditor Asignado"] || "").toString().toLowerCase().trim();
          return a && !BLOCKED_AUDITORS_SET.has(a);
        })
        .map(r => {
          // Normalización básica
          const auditor = (r["Auditor Asignado"] || "").toString().trim();
          const area = (r["Área"] || "").toString().trim();
          const unidad = (r["Unidad"] || "").toString().trim();
          const tipo = (r["Tipo de Auditoría"] || "").toString().trim();
          
          let depto = r["Departamento"] || '';
          if (!depto) {
            const keys = Object.keys(r);
            const dk = keys.find(k => k.toLowerCase().includes('depto') || k.toLowerCase().includes('departamento') || k.toLowerCase().includes('ubicación'));
            if (dk) depto = r[dk] || '';
          }

          return {
            ...r,
            "Auditor Asignado": auditor,
            "Área": area,
            "Unidad": unidad,
            "Departamento": depto.toString().trim(),
            "Tipo de Auditoría": tipo,
            "Estado": r["Estado"] || 'Pendiente',
            "Observaciones": r["Observaciones"] || '',
            "Programador": r["Programador"] || getProgrammerFromAuditor(auditor)
          };
        });

      if (clearBefore) {
        // MODO REEMPLAZO TOTAL
        await deleteAllRecordsFromSupabase();
        rawData = incomingRecords.map((r, i) => ({ ...r, _id: i }));
      } else {
        // MODO ACUMULACIÓN (Con detección de duplicados mejorada)
        const map = new Map();
        rawData.forEach(r => map.set(getCompositeKey(r), r));
        incomingRecords.forEach(r => map.set(getCompositeKey(r), r));
        rawData = Array.from(map.values()).map((r, i) => ({ ...r, _id: i }));
      }

      // Guardar localStorage
      localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(rawData));
      
      // Sincronizar (en segundo plano)
      saveRecordsToSupabase(incomingRecords);

      // --- LIMPIEZA DE FILTROS PARA MOSTRAR DATOS ---
      document.querySelectorAll('.filter-dropdown input[type="checkbox"]').forEach(cb => cb.checked = true);
      
      document.getElementById('welcome-screen').style.display = 'none';
      initDashboard();
      updateDashboard();
      alert(`✅ Se procesaron exitosamente. Total de registros en sistema: ${rawData.length}`);
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
            const t = (d.cell.raw.innerText || '').trim();
            if (t === 'E') { d.cell.styles.fillColor = [16, 185, 129]; d.cell.styles.textColor = 255; }
            else if (t === 'P') { d.cell.styles.fillColor = [239, 68, 68]; d.cell.styles.textColor = 255; }
            else if (t === 'EP') { d.cell.styles.fillColor = [245, 158, 11]; }
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
    // Re-aplicar programador desde config actual (por si se agregaron inspectores nuevos)
    rawData.forEach(r => {
      const configProg = getProgrammerFromAuditor(r["Auditor Asignado"] || '');
      if (configProg !== 'N/D') r["Programador"] = configProg;
    });
    welcomeScreen.classList.add('hidden');
    setTimeout(() => { welcomeScreen.style.display = 'none'; }, 500);
    initDashboard();
  } else {
    loadingMsg.textContent = 'No hay datos guardados. Sube un archivo Excel para comenzar.';
  }
});
