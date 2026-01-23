import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStoragePort } from '../interfaces/file-storage.port';

@Injectable()
export class LocalFileStorageAdapter implements FileStoragePort {
  private readonly uploadDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
  }

  async save(
    file: Express.Multer.File,
    destinationPath: string,
  ): Promise<string> {
    const fullPath = path.join(this.uploadDir, destinationPath);
    const directory = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(directory, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, file.buffer);

    // Return public URL path
    return `/uploads/${destinationPath}`;
  }

  async delete(filePath: string): Promise<void> {
    // Remove /uploads/ prefix if present
    const relativePath = filePath.startsWith('/uploads/')
      ? filePath.substring('/uploads/'.length)
      : filePath;

    const fullPath = path.join(this.uploadDir, relativePath);

    try {
      await fs.unlink(fullPath);
    } catch (error) {
      // File might not exist, ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
