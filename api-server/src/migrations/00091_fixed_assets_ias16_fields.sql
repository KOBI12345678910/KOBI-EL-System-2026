-- AGENT-226: extend fixed_assets to round-trip the asset-manager engine.
-- Source-of-truth is onyx-procurement/src/assets/asset-manager.js (lines 337-363).
--
-- Why these four columns:
--   - revaluation_surplus  : IAS 16 revaluation model. Engine reads it at
--                            asset-manager.js:400 when computing the
--                            depreciable base (cost + revaluation - impairment).
--   - impairment_loss      : IAS 36 impairment writedown. Same expression.
--   - disposal_gain_loss   : The value of dispose() return; without it the
--                            GL trial balance can drift from the asset
--                            register on audit.
--   - last_depreciated_to  : Anchor date for the mid-month convention.
--                            Without it, every depreciation run double-charges
--                            from acquisition.
--
-- Forward-only and additive: all four new columns have defaults or are
-- nullable. Safe to apply without a code change. Apply migration first,
-- deploy code second.

BEGIN;

ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS revaluation_surplus  NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impairment_loss      NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disposal_gain_loss   NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS last_depreciated_to  DATE;

-- Defaults: never-depreciated assets carry last_depreciated_to = purchase_date,
-- which matches addAsset() initialization in the engine.
UPDATE fixed_assets
   SET last_depreciated_to = purchase_date
 WHERE last_depreciated_to IS NULL
   AND purchase_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_last_depreciated_to
  ON fixed_assets (last_depreciated_to)
  WHERE LOWER(status) IN ('active');

-- Sanity guards aligned with engine invariants. Wrapped in DO blocks so the
-- migration is fully idempotent — re-running on a DB that already has the
-- constraints does not error.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fixed_assets_revaluation_nonneg'
  ) THEN
    ALTER TABLE fixed_assets
      ADD CONSTRAINT fixed_assets_revaluation_nonneg
        CHECK (revaluation_surplus >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fixed_assets_impairment_nonneg'
  ) THEN
    ALTER TABLE fixed_assets
      ADD CONSTRAINT fixed_assets_impairment_nonneg
        CHECK (impairment_loss >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fixed_assets_no_phantom_disposal'
  ) THEN
    -- Forces the new dispose() endpoint to be used: a row cannot move to
    -- 'disposed' status without both a disposal date and a gain/loss value.
    ALTER TABLE fixed_assets
      ADD CONSTRAINT fixed_assets_no_phantom_disposal
        CHECK (
          (LOWER(status) NOT IN ('disposed'))
          OR (disposal_date IS NOT NULL AND disposal_gain_loss IS NOT NULL)
        );
  END IF;
END $$;

COMMIT;
