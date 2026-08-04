SELECT table_schema, count(*) AS table_count
FROM information_schema.tables
WHERE table_schema IN ('identity', 'project_governance', 'commerce', 'operations')
GROUP BY table_schema
ORDER BY table_schema;

SELECT id, phase, length(checksum) AS checksum_length
FROM public.platform_schema_migrations
ORDER BY id;
