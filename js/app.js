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
      const workbook = XLSX.read(evt.target.result, { type: 'array' });
      const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      const savedEdits = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

      // Log column names for debugging
      if (json.length > 0) {
        console.log('📋 Columnas del Excel:', Object.keys(json[0]));
      }

      const newRecords = json
        .filter(r => {
          const audName = r["Auditor Asignado"] || "";
          return !BLOCKED_AUDITORS_SET.has(audName.toLowerCase().trim());
        })
        .map((r, i) => {
          const key = getCompositeKey(r);
          const saved = savedEdits[key];
          const auditor = r["Auditor Asignado"] || '';
          const computedProgrammer = r["Programador"] || getProgrammerFromAuditor(auditor);

          return {
            ...r,
            _id: i,
            "Programador": computedProgrammer,
            "Estado": saved ? saved.Estado : r["Estado"],
            "Observaciones": saved ? saved.Observaciones : (r['Observaciones'] || '')
          };
        });

      // Guardar en Supabase en segundo plano
      saveRecordsToSupabase(newRecords).then(ok => {
        if (ok) console.log('✅ Sincronizado con Supabase');
      });

      // Usar datos del Excel directamente (tiene TODOS los campos: Departamento, etc.)
      rawData = newRecords;

      document.getElementById('welcome-screen').classList.add('hidden');
      setTimeout(() => document.getElementById('welcome-screen').style.display = 'none', 500);

      // Guardar en localStorage (preserva TODOS los campos incluyendo Departamento)
      localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(rawData));
      initDashboard();
    };
    reader.readAsArrayBuffer(files[0]);
  }
}

// --- INIT DASHBOARD ---
function initDashboard() {
  const opts = {
    year: [...new Set(rawData.map(r => r["Fecha de Creación"]?.substring(0, 4)))].filter(Boolean).sort(),
    month: [...new Set(rawData.map(r => {
      const d = r["Fecha de Creación"];
      return d?.length >= 7 ? MONTH_NAMES[parseInt(d.substring(5, 7))] : null;
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
    const d = r["Fecha de Creación"] || "";
    if (d.length < 7) return false;
    const y = d.substring(0, 4);
    const m = MONTH_NAMES[parseInt(d.substring(5, 7))];
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
  const plants = selectedProgrammer === 'all'
    ? Object.keys(PLANT_GROUPS)
    : Object.keys(PLANT_PROGRAMMER).filter(p => PLANT_PROGRAMMER[p] === selectedProgrammer);

  let body = selectedProgrammer === 'all'
    ? 'REPORTE IGP - TODAS LAS PLANTAS\n\n'
    : `REPORTE IGP - ${selectedProgrammer.toUpperCase()}\n\n`;

  plants.forEach(plant => {
    const auditors = PLANT_GROUPS[plant];
    const plantData = rawData.filter(r => auditors.includes(r["Auditor Asignado"]));
    if (plantData.length === 0) return;

    body += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `📋 ${plant} - Programador: ${PLANT_PROGRAMMER[plant]}\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    auditors.forEach(a => {
      const recs = plantData.filter(r => r["Auditor Asignado"] === a);
      if (recs.length === 0) return;

      const igps = recs.filter(r => (r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));
      const hallazgos = recs.filter(r => !(r["Tipo de Auditoría"] || '').trim().toUpperCase().startsWith('IGP'));

      body += `👤 ${a}\n`;
      if (igps.length > 0) {
        body += `   IGP (${igps.length}):\n`;
        igps.forEach(r => {
          body += `   • ${r["Tipo de Auditoría"]} | ${r["Departamento"] || r["Área"] || ''} | Estado: ${r["Estado"]}\n`;
        });
      }
      if (hallazgos.length > 0) {
        body += `   Hallazgos (${hallazgos.length}):\n`;
        hallazgos.forEach(r => {
          body += `   • ${r["Tipo de Auditoría"]} | Estado: ${r["Estado"]}\n`;
        });
      }
      body += '\n';
    });
  });

  const subject = selectedProgrammer === 'all'
    ? 'Reporte IGP - Todas las Plantas'
    : `Reporte IGP - ${selectedProgrammer}`;

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

  const histData = rawData.filter(r =>
    r["Fecha de Creación"]
    && r["Fecha de Creación"].includes(y)
    && MONTH_NAMES[parseInt(r["Fecha de Creación"].substring(5, 7))] === m
  );

  if (histData.length === 0) return alert("No hay datos");

  const doc = new jspdf.jsPDF('l');
  doc.text(`Reporte Histórico IGP - ${m} ${y}`, 14, 15);
  doc.autoTable({
    head: [['Inspector', 'Programador', 'Área', 'Estado', 'Obs']],
    body: histData.map(r => [r["Auditor Asignado"], r["Programador"], r["Área"], r["Estado"], r["Observaciones"]]),
    startY: 25, theme: 'grid'
  });
  doc.save(`IGP_${m}_${y}.pdf`);
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
