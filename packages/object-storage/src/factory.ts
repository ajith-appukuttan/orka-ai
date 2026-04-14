import type { ObjectStorageClient } from './types.js';
import { MinioObjectStorageClient } from './minio.js';
import { GcsObjectStorageClient } from './gcs.js';

/**
 * Create an ObjectStorageClient based on the OBJECT_STORAGE_PROVIDER env var.
 * - "minio" → MinioObjectStorageClient (local dev)
 * - "gcs"   → GcsObjectStorageClient (cloud)
 */
export function createStorageClient(): ObjectStorageClient {
  const provider = (process.env.OBJECT_STORAGE_PROVIDER || 'minio').toLowerCase();

  switch (provider) {
    case 'gcs':
      return new GcsObjectStorageClient();
    case 'minio':
    default:
      return new MinioObjectStorageClient();
  }
}

/**
 * Get the configured bucket name.
 */
export function getArtifactBucket(): string {
  return process.env.OBJECT_STORAGE_BUCKET || 'approved-artifacts';
}
