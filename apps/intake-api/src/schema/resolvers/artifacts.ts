import { query } from '../../db/pool.js';
import { createStorageClient, getArtifactBucket } from '@orka/object-storage';

const storageClient = createStorageClient();

export const artifactResolvers = {
  Query: {
    approvedArtifacts: async (_: unknown, { workspaceId }: { workspaceId: string }) => {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", workspace_id as "workspaceId",
                run_id as "runId", stage, artifact_type as "artifactType",
                version, bucket_name as "bucketName", object_key as "objectKey",
                checksum, approved_by as "approvedBy", approved_at as "approvedAt",
                status
         FROM approved_artifacts_v2
         WHERE workspace_id = $1 AND status = 'APPROVED'
         ORDER BY approved_at DESC`,
        [workspaceId],
      );
      return result.rows;
    },

    approvedArtifact: async (_: unknown, { id }: { id: string }) => {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", workspace_id as "workspaceId",
                run_id as "runId", stage, artifact_type as "artifactType",
                version, bucket_name as "bucketName", object_key as "objectKey",
                checksum, approved_by as "approvedBy", approved_at as "approvedAt",
                status
         FROM approved_artifacts_v2
         WHERE id = $1`,
        [id],
      );

      const artifact = result.rows[0];
      if (!artifact) return null;

      // Generate a signed download URL
      if (storageClient.getSignedUrl) {
        try {
          artifact.downloadUrl = await storageClient.getSignedUrl({
            bucket: artifact.bucketName,
            key: artifact.objectKey,
            expiresInSeconds: 3600,
          });
        } catch {
          artifact.downloadUrl = null;
        }
      }

      return artifact;
    },

    approvedArtifactsByRun: async (_: unknown, { runId }: { runId: string }) => {
      const result = await query(
        `SELECT id, tenant_id as "tenantId", workspace_id as "workspaceId",
                run_id as "runId", stage, artifact_type as "artifactType",
                version, bucket_name as "bucketName", object_key as "objectKey",
                checksum, approved_by as "approvedBy", approved_at as "approvedAt",
                status
         FROM approved_artifacts_v2
         WHERE run_id = $1
         ORDER BY approved_at DESC`,
        [runId],
      );
      return result.rows;
    },
  },
};
