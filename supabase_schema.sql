-- ============================================
-- IGP Dashboard – Vitapro
-- Supabase PostgreSQL Schema
-- ============================================

-- Tabla principal de registros IGP
CREATE TABLE IF NOT EXISTS igp_records (
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
  raw_data JSONB, -- Almacena los datos originales del Excel por si se necesitan
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_igp_auditor ON igp_records (auditor_asignado);
CREATE INDEX idx_igp_fecha ON igp_records (fecha_creacion);
CREATE INDEX idx_igp_planta ON igp_records (planta);
CREATE INDEX idx_igp_estado ON igp_records (estado);

-- Función para actualizar `updated_at` automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para auto-actualizar updated_at
CREATE TRIGGER update_igp_records_updated_at
  BEFORE UPDATE ON igp_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) - Habilitar
ALTER TABLE igp_records ENABLE ROW LEVEL SECURITY;

-- Política: Lectura pública (ajustar según necesidad)
CREATE POLICY "Permitir lectura a todos"
  ON igp_records FOR SELECT
  USING (true);

-- Política: Inserción pública (ajustar según necesidad)
CREATE POLICY "Permitir inserción a todos"
  ON igp_records FOR INSERT
  WITH CHECK (true);

-- Política: Actualización pública (ajustar según necesidad)
CREATE POLICY "Permitir actualización a todos"
  ON igp_records FOR UPDATE
  USING (true);

-- Política: Eliminación pública (ajustar según necesidad)
CREATE POLICY "Permitir eliminación a todos"
  ON igp_records FOR DELETE
  USING (true);

-- ============================================
-- NOTA: Para producción, cambiar las políticas
-- RLS para requerir autenticación:
--
-- CREATE POLICY "Solo usuarios autenticados"
--   ON igp_records FOR ALL
--   USING (auth.role() = 'authenticated');
-- ============================================
