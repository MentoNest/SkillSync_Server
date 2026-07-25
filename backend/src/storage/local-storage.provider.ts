import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { StorageProvider } from './storage-provider.interface.js';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = this.configService.get<string>(
      'LOCAL_UPLOAD_DIR',
      join(process.cwd(), 'uploads'),
    );
    this.baseUrl = this.configService.get<string>(
      'LOCAL_UPLOAD_BASE_URL',
      '/uploads',
    );
  }

  // Local storage does not need the content type; kept for interface parity.
  async upload(key: string, buffer: Buffer): Promise<string> {
    const filePath = join(this.uploadDir, key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return `${this.baseUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.uploadDir, key);
    try {
      await rm(filePath, { force: true });
    } catch (err) {
      this.logger.warn(`Failed to delete local file ${filePath}: ${err}`);
    }
  }
}
