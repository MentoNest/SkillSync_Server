import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { AuditService } from '../../audit/audit.service';
import { User } from '../entities/user.entity';
import { StorageService } from './storage.service';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MIN_AVATAR_DIMENSION = 200;
export const MAX_AVATAR_DIMENSION = 2000;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_SIZES = { thumbnail: 64, small: 200, medium: 400 } as const;
export type AvatarSizeName = keyof typeof AVATAR_SIZES;

export interface AvatarUrls {
  avatarUrl: string;
  avatarThumbnailUrl: string;
  avatarSmallUrl: string;
  avatarMediumUrl: string;
}

@Injectable()
export class AvatarService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async uploadAvatar(userId: string, file?: Express.Multer.File): Promise<AvatarUrls> {
    this.validateFile(file);
    const meta = await sharp(file!.buffer).metadata();
    this.validateDimensions(meta);

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.deletePrevious(user);

    const pipeline = sharp(file!.buffer);
    const base = `${userId}-${Date.now()}`;
    const original = await pipeline.clone().jpeg({ quality: 80, progressive: true }).toBuffer();

    const urls: AvatarUrls = {
      avatarUrl: await this.storage.save(original, `${base}.jpg`),
      avatarThumbnailUrl: '',
      avatarSmallUrl: '',
      avatarMediumUrl: '',
    };

    for (const [name, size] of Object.entries(AVATAR_SIZES) as [AvatarSizeName, number][]) {
      const buffer = await pipeline
        .clone()
        .resize(size, size, { fit: 'cover' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();
      const url = await this.storage.save(buffer, `${base}-${name}.jpg`);
      if (name === 'thumbnail') urls.avatarThumbnailUrl = url;
      else if (name === 'small') urls.avatarSmallUrl = url;
      else urls.avatarMediumUrl = url;
    }

    user.avatarUrl = urls.avatarUrl;
    user.avatarThumbnailUrl = urls.avatarThumbnailUrl;
    user.avatarSmallUrl = urls.avatarSmallUrl;
    user.avatarMediumUrl = urls.avatarMediumUrl;
    await this.users.save(user);

    void this.audit.record({ event: AuditEvent.AVATAR_UPDATED, userId, metadata: { ...urls } });
    return urls;
  }

  private validateFile(file?: Express.Multer.File): void {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!AVATAR_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Unsupported image type: only JPEG, PNG and WebP are allowed');
    }
    if (file.size > MAX_AVATAR_BYTES) throw new BadRequestException('Image exceeds the 5MB size limit');
  }

  private validateDimensions(meta: sharp.Metadata): void {
    const { width, height } = meta;
    if (!width || !height) throw new BadRequestException('Invalid or unreadable image');
    const outOfRange =
      width < MIN_AVATAR_DIMENSION ||
      height < MIN_AVATAR_DIMENSION ||
      width > MAX_AVATAR_DIMENSION ||
      height > MAX_AVATAR_DIMENSION;
    if (outOfRange) {
      throw new BadRequestException(
        `Image dimensions must be between ${MIN_AVATAR_DIMENSION}x${MIN_AVATAR_DIMENSION} and ${MAX_AVATAR_DIMENSION}x${MAX_AVATAR_DIMENSION}`,
      );
    }
  }

  private async deletePrevious(user: User): Promise<void> {
    const previous = [user.avatarUrl, user.avatarThumbnailUrl, user.avatarSmallUrl, user.avatarMediumUrl].filter(
      (url): url is string => !!url,
    );
    await Promise.all(previous.map((url) => this.storage.delete(url)));
  }
}
