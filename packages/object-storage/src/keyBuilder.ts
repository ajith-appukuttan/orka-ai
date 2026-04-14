import type { ArtifactKeyParams } from './types.js';

/**
 * Build a deterministic object key for an approved artifact.
 *
 * Format: approved-artifacts/{tenantId}/{workspaceId}/{projectId}/{stage}/{runId}/{artifactType}/v{version}.{ext}
 */
export function buildArtifactKey(params: ArtifactKeyParams): string {
  const ext = params.extension || 'json';
  return [
    'approved-artifacts',
    params.tenantId,
    params.workspaceId,
    params.projectId,
    params.stage.toLowerCase(),
    params.runId,
    params.artifactType.toLowerCase(),
    `v${params.version}.${ext}`,
  ].join('/');
}
