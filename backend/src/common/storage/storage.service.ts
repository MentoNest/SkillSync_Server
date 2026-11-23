import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { basename, join } from 'path';
import type { AttachmentFile, ValidatedAttachment } from './storage.constants';
import { validateAttachment } from './storage.constants';

@Injectable()
export class LocalStorageService {
  private readonly dir: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('CHAT_UPLOAD_DIR') ?? 'uploads/chat';
    this.publicBase =
      config.get<string>('CHAT_UPLOAD_PUBLIC_PATH') ?? '/uploads/chat';
  }

  validate(file: AttachmentFile | undefined): ValidatedAttachment {
    return validateAttachment(file);
  }

  async save(buffer: Buffer, filename: string): Promise<string> {
    const name = basename(filename);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(join(this.dir, name), buffer);
    return `${this.publicBase.replace(/\/$/, '')}/${name}`;
  }

  async delete(url: string | null | undefined): Promise<void> {
    const name = url ? basename(url) : '';
    if (!name) return;
    try {
      await fs.unlink(join(this.dir, name));
    } catch {
      return;
    }
  }
}
