SELECT 'accounts', count(*) FROM identity.accounts
UNION ALL SELECT 'organizations', count(*) FROM identity.organizations
UNION ALL SELECT 'memberships', count(*) FROM identity.memberships
UNION ALL SELECT 'projects', count(*) FROM project_governance.projects
UNION ALL SELECT 'sessions', count(*) FROM identity.sessions
UNION ALL SELECT 'audit_events', count(*) FROM operations.audit_events
ORDER BY 1;

SELECT status, count(*) FROM public.platform_import_runs GROUP BY status ORDER BY status;
SELECT status, count(*) FROM public.platform_import_steps GROUP BY status ORDER BY status;
SELECT count(*) AS immutable_reports FROM public.platform_import_reports;

SELECT count(*) AS project_ownership_mismatches
FROM project_governance.projects p
LEFT JOIN identity.organizations o ON o.id = p.organization_id
WHERE o.id IS NULL OR p.created_by_account_id <> o.owner_account_id;
