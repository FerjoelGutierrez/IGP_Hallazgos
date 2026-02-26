# IGP Dashboard – Vitapro (Pro)

Dashboard de Inspección General Programada para Vitapro. Aplicación web para monitoreo de cumplimiento, reportes por planta y análisis avanzado.

## 🚀 Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Base de Datos**: Supabase (PostgreSQL)
- **Gráficos**: Chart.js
- **Excel**: SheetJS (xlsx)
- **PDF**: jsPDF + jspdf-autotable
- **Despliegue**: Vercel

## 📁 Estructura del Proyecto

```
igp-dashboard/
├── index.html          # Página principal
├── css/
│   └── styles.css      # Estilos (idénticos al original)
├── js/
│   ├── config.js       # Configuración y constantes
│   ├── helpers.js      # Funciones auxiliares + Supabase CRUD
│   ├── renderers.js    # Renderizado de gráficos y tablas
│   └── app.js          # Lógica principal de la aplicación
├── supabase_schema.sql # Schema de la base de datos
└── vercel.json         # Configuración de Vercel
```

## ⚙️ Configuración

### 1. Supabase
1. Crear un proyecto en [supabase.com](https://supabase.com)
2. Ejecutar el archivo `supabase_schema.sql` en el SQL Editor
3. Editar `js/config.js` con tus credenciales:
   ```js
   const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
   const SUPABASE_ANON_KEY = 'TU-ANON-KEY-AQUI';
   ```

### 2. GitHub
```bash
git init
git add .
git commit -m "Initial commit - IGP Dashboard"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/igp-dashboard.git
git push -u origin main
```

### 3. Vercel
1. Importar el repositorio de GitHub en [vercel.com](https://vercel.com)
2. Framework: `Other` (sitio estático)
3. Output Directory: `.` (raíz)
4. Deploy automático

## 🔧 Uso Local
Abrir `index.html` directamente en el navegador (funciona como archivo local).

## 📊 Funcionalidades
- ✅ Carga de archivos Excel (.xlsx, .xls)
- ✅ Dashboard con KPIs en tiempo real
- ✅ Gráficos de evolución, distribución, plantas y tendencias
- ✅ Matriz de cumplimiento por inspector/mes
- ✅ Reportes por planta con programador asignado
- ✅ Detalle de registros con gestión CRM
- ✅ Análisis mensual y ranking de auditores
- ✅ Exportación a PDF y Excel
- ✅ Persistencia en Supabase + localStorage (fallback)
- ✅ Filtros globales multi-selección
