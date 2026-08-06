-- description: Add non-sensitive provider connection metadata required by setup and health flows
-- rollback: Export connection metadata before removing the additive metadata column
-- minimum-app-version: 0.1.0
ALTER TABLE integrations.connections ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(metadata)='object');
ALTER TABLE integrations.connections ALTER COLUMN metadata DROP DEFAULT;
