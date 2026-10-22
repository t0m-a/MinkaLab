-- =====================================================================
-- MINKA LAB INITIATIVE — ESQUEMA DE BASE DE DATOS CLOUDFLARE D1
-- =====================================================================

-- Tabla para almacenar registros del formulario "Súmate / Voluntariado"
CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    nombre TEXT NOT NULL,
    contacto TEXT NOT NULL,
    ubicacion TEXT,
    rol TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    status TEXT DEFAULT 'nuevo' -- Estados sugeridos: 'nuevo', 'contactado', 'archivado'
);

-- Índices para búsquedas y ordenamientos eficientes
CREATE INDEX IF NOT EXISTS idx_registros_created_at ON registros(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registros_status ON registros(status);
