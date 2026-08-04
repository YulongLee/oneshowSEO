SELECT
  current_user,
  has_schema_privilege(current_user, 'identity', 'USAGE') AS identity_usage,
  has_schema_privilege(current_user, 'identity', 'CREATE') AS identity_create,
  has_table_privilege(current_user, 'identity.organizations', 'SELECT') AS organizations_select,
  has_schema_privilege(current_user, 'operations', 'USAGE') AS operations_usage,
  has_schema_privilege(current_user, 'operations', 'CREATE') AS operations_create,
  has_table_privilege(current_user, 'operations.audit_events', 'SELECT') AS audit_select;
