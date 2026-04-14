-- Add change_category to visual_requirements for classifying requirement types
ALTER TABLE visual_requirements
  ADD COLUMN IF NOT EXISTS change_category VARCHAR(50)
  CHECK (change_category IN (
    'STYLE', 'LAYOUT', 'CONTENT', 'INTERACTION',
    'VALIDATION', 'ACCESSIBILITY', 'DATA_DISPLAY'
  ));

-- Index for filtering by category
CREATE INDEX IF NOT EXISTS idx_visual_requirements_category
  ON visual_requirements(change_category)
  WHERE change_category IS NOT NULL;
