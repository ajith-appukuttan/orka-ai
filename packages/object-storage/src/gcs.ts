import { Storage } from '@google-cloud/storage';
import type {
  ObjectStorageClient,
  PutObjectInput,
  PutObjectOutput,
  GetObjectInput,
  GetSignedUrlInput,
} from './types.js';
import crypto from 'node:crypto';

export class GcsObjectStorageClient implements ObjectStorageClient {
  private storage: Storage;

  constructor() {
    this.storage = new Storage();
  }

  async putObject(input: PutObjectInput): Promise<PutObjectOutput> {
    const body = typeof input.body === 'string' ? Buffer.from(input.body) : input.body;
    const checksum = crypto.createHash('sha256').update(body).digest('hex');

    const bucket = this.storage.bucket(input.bucket);
    const file = bucket.file(input.key);

    await file.save(body, {
      contentType: input.contentType,
      metadata: {
        metadata: input.metadata,
      },
    });

    return { checksum };
  }

  async getObject(input: GetObjectInput): Promise<Buffer> {
    const bucket = this.storage.bucket(input.bucket);
    const file = bucket.file(input.key);
    const [contents] = await file.download();
    return contents;
  }

  async getSignedUrl(input: GetSignedUrlInput): Promise<string> {
    const bucket = this.storage.bucket(input.bucket);
    const file = bucket.file(input.key);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + input.expiresInSeconds * 1000,
    });
    return url;
  }
}
