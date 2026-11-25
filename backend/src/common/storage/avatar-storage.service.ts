import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import { dirname, join, normalize, resolve } from 'path';

export interface AvatarStorageConfig {
  driver: 'local' | 's3';
  localDir: string;
  publicBase: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  cdnBaseUrl?: string;
}

export function resolveAvatarStorageConfig(
  read: (key: string) => string | undefined,
): AvatarStorageConfig {
  const bucket = read('AWS_S3_BUCKET')?.trim();
  const region =
    read('AWS_REGION')?.trim() ||
    read('AWS_DEFAULT_REGION')?.trim() ||
    'us-east-1';
  const accessKeyId =
    read('AWS_ACCESS_KEY_ID')?.trim() || read('AWS_ACCESS_KEY')?.trim();
  const secretAccessKey =
    read('AWS_SECRET_ACCESS_KEY')?.trim() || read('AWS_SECRET_KEY')?.trim();
  const endpoint = read('AWS_S3_ENDPOINT')?.trim();
  const cdnBaseUrl = read('AVATAR_CDN_BASE_URL')?.trim();
  const explicitDriver = read('AVATAR_STORAGE_DRIVER')?.trim().toLowerCase();
  const isProd = read('NODE_ENV')?.trim().toLowerCase() === 'production';

  const driver: 'local' | 's3' =
    explicitDriver === 's3' ||
    (explicitDriver !== 'local' && isProd && Boolean(bucket))
      ? 's3'
      : 'local';

  return {
    driver,
    localDir: read('AVATAR_UPLOAD_DIR')?.trim() || 'uploads/avatars',
    publicBase: read('AVATAR_UPLOAD_PUBLIC_PATH')?.trim() || '/uploads/avatars',
    s3Bucket: bucket,
    s3Region: region,
    s3Endpoint: endpoint,
    s3AccessKeyId: accessKeyId,
    s3SecretAccessKey: secretAccessKey,
    cdnBaseUrl,
  };
}

@Injectable()
export class AvatarStorageService {
  private readonly logger = new Logger(AvatarStorageService.name);
  private readonly settings: AvatarStorageConfig;
  private s3Client: S3Client | null = null;

  constructor(@Optional() config?: ConfigService) {
    this.settings = resolveAvatarStorageConfig(
      (key) => config?.get<string>(key) ?? process.env[key],
    );
  }

  get driver(): 'local' | 's3' {
    return this.settings.driver;
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const cleanKey = this.sanitizeKey(key);
    if (this.settings.driver === 's3') {
      return this.uploadToS3(cleanKey, buffer, contentType);
    }
    return this.uploadLocally(cleanKey, buffer);
  }

  async deleteByUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    if (this.settings.driver === 's3') {
      await this.deleteFromS3(url);
      return;
    }
    await this.deleteLocally(url);
  }

  private async uploadLocally(key: string, buffer: Buffer): Promise<string> {
    const baseDir = resolve(this.settings.localDir);
    const targetPath = resolve(baseDir, key);
    if (!targetPath.startsWith(baseDir)) {
      throw new Error('Invalid storage path');
    }
    await fs.mkdir(dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
    const base = this.settings.publicBase.replace(/\/$/, '');
    return `${base}/${key}`;
  }

  private async deleteLocally(url: string): Promise<void> {
    const base = this.settings.publicBase.replace(/\/$/, '');
    if (!url.startsWith(`${base}/`) && !url.startsWith('/')) {
      return;
    }
    const relative = url.startsWith(`${base}/`)
      ? url.slice(base.length + 1)
      : url.replace(/^\/+/, '');
    const safeRelative = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
    if (!safeRelative) return;
    try {
      await fs.unlink(join(resolve(this.settings.localDir), safeRelative));
    } catch {
      return;
    }
  }

  private getS3Client(): S3Client {
    if (this.s3Client) return this.s3Client;
    if (!this.settings.s3Bucket) {
      throw new Error(
        'AWS_S3_BUCKET must be configured when using S3 avatar storage',
      );
    }
    this.s3Client = new S3Client({
      region: this.settings.s3Region,
      endpoint: this.settings.s3Endpoint || undefined,
      credentials:
        this.settings.s3AccessKeyId && this.settings.s3SecretAccessKey
          ? {
              accessKeyId: this.settings.s3AccessKeyId,
              secretAccessKey: this.settings.s3SecretAccessKey,
            }
          : undefined,
    });
    return this.s3Client;
  }

  private async uploadToS3(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const client = this.getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: this.settings.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    if (this.settings.cdnBaseUrl) {
      return `${this.settings.cdnBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    if (this.settings.s3Endpoint) {
      return `${this.settings.s3Endpoint.replace(/\/$/, '')}/${this.settings.s3Bucket}/${key}`;
    }
    return `https://${this.settings.s3Bucket}.s3.${this.settings.s3Region}.amazonaws.com/${key}`;
  }

  private async deleteFromS3(url: string): Promise<void> {
    const key = this.extractS3Key(url);
    if (!key || !this.settings.s3Bucket) return;
    try {
      await this.getS3Client().send(
        new DeleteObjectCommand({
          Bucket: this.settings.s3Bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete old S3 avatar object (${key}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private extractS3Key(url: string): string | null {
    if (this.settings.cdnBaseUrl) {
      const cdnBase = `${this.settings.cdnBaseUrl.replace(/\/$/, '')}/`;
      if (url.startsWith(cdnBase)) return url.slice(cdnBase.length);
    }
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/^\/+/, '');
      if (
        this.settings.s3Bucket &&
        pathname.startsWith(`${this.settings.s3Bucket}/`)
      ) {
        return pathname.slice(this.settings.s3Bucket.length + 1);
      }
      return pathname || null;
    } catch {
      return null;
    }
  }

  private sanitizeKey(key: string): string {
    return key.replace(/^\/+/, '').replace(/\.\./g, '');
  }
}
