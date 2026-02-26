// ============================================
// IGP Dashboard – Configuración y Constantes
// ============================================

// --- SUPABASE CONFIG ---
// ⚠️ REEMPLAZAR con tus credenciales de Supabase
const SUPABASE_URL = 'https://bvrrbnnmprbxqdjusqim.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2cnJibm5tcHJieHFkanVzcWltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzA4MTIsImV4cCI6MjA4NzcwNjgxMn0.e3SX9X3KWXUDdgYb6i_VyObZB5rED6dhLSmwE4O2rY0';

// Inicializar cliente Supabase
let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// --- STORAGE KEYS ---
const STORAGE_KEY = 'IGP_Dashboard_Edits_V1';
const STORAGE_DATA_KEY = 'IGP_Dashboard_RawData_V1';

// --- PLANT GROUPS ---
const PLANT_GROUPS = {
  "Planta Exteriores": [
    "Andrea Padilla Nieto", "Angel Rodriguez", "Aura Hidalgo",
    "Diego Lucero", "Leonardo Girón", "Sharon Michaela Rivera Valencia",
    "Maria Gabriela Cornejo", "Juan Manuel Leon Llanos",
    "Kevin Jesus Zambrano Palacios", "Ana Valeria Yong Mera"
  ],
  "Planta 1": [
    "Christian Fajardo", "Christian Oswaldo Tumalie Freire",
    "Gloria Estefania Montenegro Aquino", "Irma Rocio Pacheco Erazo",
    "Luis Enrique Moreno Muñoz", "Miriam Mancero", "Roberto Monserrate",
    "Vanessa Del Rocio Jimenez Soto", "Victor Cevallos", "Carlos Reinoso"
  ],
  "Planta 2": [
    "Harol Espinoza", "Israel Pazmiño", "Junior Suárez",
    "Mirella Cabezas", "Pool Rosadio", "Simon Alejandro Medina Mendoza",
    "Victor Rodriguez", "Willian Zuñiga Cruzado",
    "Laly Noemi Jaramillo Moncada", "Olivio Arturo Suarez Pozo",
    "Nadia Evelin Calderon Vega"
  ]
};

const PLANT_PROGRAMMER = {
  "Planta Exteriores": "Andrés Mena",
  "Planta 1": "Lucia Veliz",
  "Planta 2": "Nicole Facuy"
};

const BLOCKED_AUDITORS = [
  "Luiggi Bolivar Carriel Garcia", "Giuliana Javier",
  "Lucia Lissetth Veliz Ubilla", "Lucia Veliz",
  "Andrés Mena", "Nicolle García", "Fernando Joel Gutierrez Vistin"
];
const BLOCKED_AUDITORS_SET = new Set(BLOCKED_AUDITORS.map(n => n.toLowerCase().trim()));

// Map Inspector -> Planta
const AUDITOR_TO_PLANT = {};
Object.keys(PLANT_GROUPS).forEach(p =>
  PLANT_GROUPS[p].forEach(a => AUDITOR_TO_PLANT[a.toLowerCase().trim()] = p)
);

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const FILTER_LABELS = {
  year: 'Año', month: 'Mes', area: 'Área',
  type: 'Tipo', auditor: 'Inspector', programmer: 'Programador'
};
