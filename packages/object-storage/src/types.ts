export interface PutObjectInput {
  bucket: string;
  key: string;
  body: Buffer | string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface PutObjectOutput {
  etag?: string;
  checksum?: string;
}

export interface GetObjectInput {
  bucket: string;
  key: string;
}

export interface GetSignedUrlInput {
  bucket: string;
  key: string;
  expiresInSeconds: number;
}

export interface ObjectStorageClient {
  putObject(input: PutObjectInput): Promise<PutObjectOutput>;
  getObject(input: GetObjectInput): Promise<Buffer>;
  getSignedUrl?(input: GetSignedUrlInput): Promise<string>;
}

export interface ArtifactKeyParams {
  tenantId: string;
  workspaceId: string;
  projectId: string;
  stage: string;
  runId: string;
  artifactType: string;
  version: number;
  extension?: string;
}
