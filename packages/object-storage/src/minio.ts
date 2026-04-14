import { Client as MinioClient } from 'minio';
import type {
  ObjectStorageClient,
  PutObjectInput,
  PutObjectOutput,
  GetObjectInput,
  GetSignedUrlInput,
} from './types.js';
import crypto from 'node:crypto';

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

export function createMinioConfig(): MinioConfig {
  const endpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
  const url = new URL(endpoint);
  return {
    endPoint: url.hostname,
    port: parseInt(url.port) || 9000,
    useSSL: url.protocol === 'https:',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minio',
    secretKey: process.env.MINIO_SECRET_KEY || 'minio123',
  };
}

export class MinioObjectStorageClient implements ObjectStorageClient {
  private client: MinioClient;

  constructor(config?: MinioConfig) {
    const cfg = config || createMinioConfig();
    this.client = new MinioClient(cfg);
  }

  async putObject(input: PutObjectInput): Promise<PutObjectOutput> {
    const body = typeof input.body === 'string' ? Buffer.from(input.body) : input.body;
    const checksum = crypto.createHash('sha256').update(body).digest('hex');

    const metadata: Record<string, string> = {
      'Content-Type': input.contentType,
      ...input.metadata,
    };

    await this.client.putObject(input.bucket, input.key, body, body.length, metadata);

    return { checksum };
  }

  async getObject(input: GetObjectInput): Promise<Buffer> {
    const stream = await this.client.getObject(input.bucket, input.key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    return this.client.presignedGetObject(input.bucket, input.key, input.expiresInSeconds);
  }
}
