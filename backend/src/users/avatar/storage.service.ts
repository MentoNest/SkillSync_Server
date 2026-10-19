import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { basename, join } from 'path';

/** Persists generated avatar variants and returns a publicly reachable URL. */
export abstract class StorageService {
  abstract save(buffer: Buffer, filename: string): Promise<string>;
  abstract delete(url: string | null | undefined): Promise<void>;
}

/** Where a local storage driver writes files and the URL path it serves them from. */
export interface LocalStorageLocation {
  dir: string;
  publicPath: string;
}

/**
 * Development driver: stores files on the local filesystem under `UPLOAD_DIR`,
 * or under `location` when one is given (e.g. chat attachments).
 */
@Injectable()
export class LocalStorageService extends StorageService {
  private readonly dir: string;
  private readonly publicBase: string;

  constructor(config: ConfigService, location?: LocalStorageLocation) {
    super();
    this.dir = location?.dir ?? config.get<string>('UPLOAD_DIR') ?? 'uploads/avatars';
    this.publicBase = location?.publicPath ?? config.get<string>('UPLOAD_PUBLIC_PATH') ?? '/uploads/avatars';
  }

  async save(buffer: Buffer, filename: string): Promise<string> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(join(this.dir, filename), buffer);
    return `${this.publicBase}/${filename}`;
  }

  async delete(url: string | null | undefined): Promise<void> {
    const name = url ? basename(url) : '';
    if (!name) return;
    try {
      await fs.unlink(join(this.dir, name));
    } catch {
      // File already gone or never written; nothing to clean up.
    }
  }
}

/** Cloud driver stub selected with `STORAGE_DRIVER=s3`. No AWS SDK dependency is bundled. */
@Injectable()
export class S3StorageService extends StorageService {
  private readonly bucket?: string;
  private readonly region?: string;
  private readonly accessKey?: string;
  private readonly secretKey?: string;

  constructor(config: ConfigService) {
    super();
    this.bucket = config.get<string>('AWS_BUCKET');
    this.region = config.get<string>('AWS_REGION');
    this.accessKey = config.get<string>('AWS_ACCESS_KEY');
    this.secretKey = config.get<string>('AWS_SECRET_KEY');
  }

  private assertConfigured(): void {
    const missing = [
      ['AWS_ACCESS_KEY', this.accessKey],
      ['AWS_SECRET_KEY', this.secretKey],
      ['AWS_BUCKET', this.bucket],
      ['AWS_REGION', this.region],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length) throw new Error(`S3 storage is not configured (missing: ${missing.join(', ')})`);
  }

  save(): Promise<string> {
    this.assertConfigured();
    throw new Error('S3 storage driver is not implemented; provide an AWS SDK adapter before enabling it');
  }

  async delete(): Promise<void> {
    // No-op until the S3 adapter is implemented.
  }
}
