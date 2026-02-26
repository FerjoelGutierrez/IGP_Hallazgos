-- ============================================
-- IGP Dashboard – Vitapro
-- RESET + RECREAR Schema
-- ============================================

-- Eliminar tabla si existe (esto borra todo y recrea limpio)
DROP TABLE IF EXISTS igp_records CASCADE;

-- Tabla principal de registros IGP
CREATE TABLE igp_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unidad TEXT,
  area TEXT,
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

-- Índices
CREATE INDEX idx_igp_auditor ON igp_records (auditor_asignado);
CREATE INDEX idx_igp_fecha ON igp_records (fecha_creacion);
CREATE INDEX idx_igp_planta ON igp_records (planta);
CREATE INDEX idx_igp_estado ON igp_records (estado);

-- Trigger para auto-actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_igp_records_updated_at
  BEFORE UPDATE ON igp_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE igp_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura a todos" ON igp_records FOR SELECT USING (true);
CREATE POLICY "Permitir inserción a todos" ON igp_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir actualización a todos" ON igp_records FOR UPDATE USING (true);
CREATE POLICY "Permitir eliminación a todos" ON igp_records FOR DELETE USING (true);
