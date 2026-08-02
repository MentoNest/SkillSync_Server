import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { User } from './entities/user.entity.js';
import { AvatarResponseDto } from './dto/avatar-response.dto.js';
import { STORAGE_PROVIDER } from '../storage/storage.constants.js';
import type { StorageProvider } from '../storage/storage-provider.interface.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_DIMENSION = 200;
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 80;

const VARIANTS: Record<string, number | null> = {
  original: null,
  thumbnail: 64,
  small: 200,
  medium: 400,
};

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  async uploadAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<AvatarResponseDto> {
    this.validateFile(file);

    const metadata = await sharp(file.buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      throw new BadRequestException(
        `Image must be at least ${MIN_DIMENSION}x${MIN_DIMENSION}px`,
      );
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new BadRequestException(
        `Image must be at most ${MAX_DIMENSION}x${MAX_DIMENSION}px`,
      );
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const keyPrefix = `avatars/${userId}/${randomUUID()}`;
    const urls: Record<string, string> = {};

    for (const [variant, size] of Object.entries(VARIANTS)) {
      const buffer = await this.processImage(file.buffer, size);
      const key = `${keyPrefix}-${variant}.jpg`;
      urls[variant] = await this.storage.upload(key, buffer, 'image/jpeg');
    }

    const previousStorageKey = user.avatarStorageKey;

    user.avatarUrl = urls.original;
    user.avatarThumbnailUrl = urls.thumbnail;
    user.avatarStorageKey = keyPrefix;
    await this.userRepo.save(user);

    if (previousStorageKey) {
      await this.deleteVariants(previousStorageKey);
    }

    this.logger.log(
      JSON.stringify({
        event: 'AVATAR_UPLOADED',
        userId,
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      avatarUrl: urls.original,
      avatarThumbnailUrl: urls.thumbnail,
      avatarSmallUrl: urls.small,
      avatarMediumUrl: urls.medium,
    };
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type. Only JPEG, PNG, and WebP are allowed',
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 5MB size limit');
    }
  }

  private async processImage(
    buffer: Buffer,
    size: number | null,
  ): Promise<Buffer> {
    let pipeline = sharp(buffer);
    if (size) {
      pipeline = pipeline.resize(size, size, { fit: 'cover' });
    }
    return pipeline
      .jpeg({ quality: JPEG_QUALITY, progressive: true })
      .toBuffer();
  }

  private async deleteVariants(keyPrefix: string): Promise<void> {
    await Promise.all(
      Object.keys(VARIANTS).map((variant) =>
        this.storage
          .delete(`${keyPrefix}-${variant}.jpg`)
          .catch((err: unknown) =>
            this.logger.warn(
              `Failed to delete old avatar variant: ${String(err)}`,
            ),
          ),
      ),
    );
  }
}
