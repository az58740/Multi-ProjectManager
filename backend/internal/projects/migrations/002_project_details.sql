ALTER TABLE projects ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS destination TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS accountant TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_cost_currency TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS default_sales_currency TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS sequence
    FROM projects
    WHERE code IS NULL OR code = ''
)
UPDATE projects AS project
SET code = 'PRJ-LEGACY-' || lpad(numbered.sequence::TEXT, 6, '0')
FROM numbered
WHERE project.id = numbered.id;

ALTER TABLE projects ALTER COLUMN code SET NOT NULL;
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'planning';
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code ON projects (code);
