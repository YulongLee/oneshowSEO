# Integration credential inventory and rotation evidence

Recorded: 2026-08-06 (Asia/Shanghai)

## Production result

- The production environment contains no Aliyun or OSS access-key variables.
- No Aliyun CLI or OSS utility profile is installed for the production root account.
- No OSS credential file exists under the application or OneShowSEO configuration directories.
- Git history and the project reference material contain no OSS access-key identifiers.
- All legacy platform data-source rows are disabled and contain no encrypted configuration.
- Customer integration connections contain no credential rows at the time of this check.
- The active artifact provider is the server-local provider rooted at `OBJECT_STORAGE_ROOT`; it has no cloud-provider credential.

There is therefore no previously configured OSS/provider credential that can authorize a new product call. No external credential rotation was needed, and the absence of any callable old credential is the invalidation evidence for this deployment.

## Enforced storage scope

Artifact keys are validated against the immutable prefix:

`oneshowseo/{organizationId}/{projectId}/{taskId}/{artifactId}/`

The production service account can write only its configured artifact directory. Future OSS enablement must use a dedicated least-privilege account restricted to the `oneshowseo/` prefix, record the old credential ID, rotate it through the provider control plane, and verify an old-key request is denied before the OSS adapter can be enabled.

No secret values, ciphertext, nonces, authorization headers, or raw provider responses are included in this evidence.
