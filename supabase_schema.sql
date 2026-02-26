-- ============================================
-- IGP Dashboard – Vitapro
-- RESET + RECREAR Schema
-- ============================================

DROP TABLE IF EXISTS igp_assignments CASCADE;
DROP TABLE IF EXISTS igp_records CASCADE;

-- Tabla principal de registros IGP
CREATE TABLE igp_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unidad TEXT,
  area TEXT,
  departamento TEXT,
  auditor_asignado TEXT NOT NULL,
  programador TEXT,
  fecha_creacion DATE,
  tipo_auditoria TEXT,
  estado TEXT DEFAULT 'Pendiente',
  observaciones TEXT DEFAULT '',
  planta TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de ASIGNACIONES IGP (editable como Excel)
CREATE TABLE igp_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inspector TEXT NOT NULL,
  area_inspector TEXT,
  programador TEXT,
  planta TEXT,
  anio INT NOT NULL DEFAULT 2025,
  mes INT NOT NULL CHECK (mes >= 1 AND mes <= 12),
  igp_tema TEXT DEFAULT '',
  igp_area TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(inspector, anio, mes)
);

-- Índices igp_records
CREATE INDEX idx_igp_auditor ON igp_records (auditor_asignado);
CREATE INDEX idx_igp_fecha ON igp_records (fecha_creacion);
CREATE INDEX idx_igp_planta ON igp_records (planta);
CREATE INDEX idx_igp_estado ON igp_records (estado);

-- Índices igp_assignments
CREATE INDEX idx_assign_inspector ON igp_assignments (inspector);
CREATE INDEX idx_assign_planta ON igp_assignments (planta);
CREATE INDEX idx_assign_anio_mes ON igp_assignments (anio, mes);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_igp_records_updated_at
  BEFORE UPDATE ON igp_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_igp_assignments_updated_at
  BEFORE UPDATE ON igp_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE igp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE igp_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_records" ON igp_records FOR SELECT USING (true);
CREATE POLICY "insert_records" ON igp_records FOR INSERT WITH CHECK (true);
CREATE POLICY "update_records" ON igp_records FOR UPDATE USING (true);
CREATE POLICY "delete_records" ON igp_records FOR DELETE USING (true);

CREATE POLICY "read_assignments" ON igp_assignments FOR SELECT USING (true);
CREATE POLICY "insert_assignments" ON igp_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "update_assignments" ON igp_assignments FOR UPDATE USING (true);
CREATE POLICY "delete_assignments" ON igp_assignments FOR DELETE USING (true);
