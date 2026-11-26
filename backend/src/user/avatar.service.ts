import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { AvatarStorageService } from '../common/storage/avatar-storage.service';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';
import { ProfileCompletenessService } from '../profile/profile-completeness.service';
import { AvatarUploadResponseDto } from './dto/avatar-upload-response.dto';
import { User } from './user.entity';
import { UserService } from './user.service';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MIN_AVATAR_DIMENSION = 200;
export const MAX_AVATAR_DIMENSION = 2000;

export const AVATAR_SIZES = {
  thumbnail: 64,
  small: 200,
  medium: 400,
} as const;

const ALLOWED_MIME_TYPES: Readonly<Record<string, 'jpeg' | 'png' | 'webp'>> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const FORMAT_EXTENSION: Record<
  'jpeg' | 'png' | 'webp',
  { ext: string; mime: string }
> = {
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  png: { ext: 'png', mime: 'image/png' },
  webp: { ext: 'webp', mime: 'image/webp' },
};

export interface AvatarUploadFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
  originalname?: string;
}

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly userService: UserService,
    private readonly storage: AvatarStorageService,
    private readonly completeness: ProfileCompletenessService,
  ) {}

  async uploadAvatar(
    walletAddress: string,
    file: AvatarUploadFile | undefined,
  ): Promise<AvatarUploadResponseDto> {
    this.validatePreProcess(file);

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException('Uploaded file is not a valid image.');
    }

    const format = metadata.format;
    if (format !== 'jpeg' && format !== 'png' && format !== 'webp') {
      throw new BadRequestException(
        'Unsupported image format. Only JPEG, PNG, and WebP are allowed.',
      );
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (
      width < MIN_AVATAR_DIMENSION ||
      height < MIN_AVATAR_DIMENSION ||
      width > MAX_AVATAR_DIMENSION ||
      height > MAX_AVATAR_DIMENSION
    ) {
      throw new BadRequestException(
        `Image dimensions must be between ${MIN_AVATAR_DIMENSION}x${MIN_AVATAR_DIMENSION} and ${MAX_AVATAR_DIMENSION}x${MAX_AVATAR_DIMENSION} pixels.`,
      );
    }

    const normalizedAddress = normalizeWalletAddress(walletAddress);
    const user = await this.userService.findOrCreate(normalizedAddress);
    const previousUrls = [
      user.avatarUrl,
      user.avatarThumbnailUrl,
      user.avatarSmallUrl,
      user.avatarMediumUrl,
    ].filter((url): url is string => Boolean(url));

    const { ext, mime } = FORMAT_EXTENSION[format];
    const token = randomUUID();
    const prefix = `${normalizedAddress}/${token}`;

    const [originalBuf, thumbnailBuf, smallBuf, mediumBuf] = await Promise.all([
      this.encode(sharp(file.buffer).rotate(), format),
      this.encode(
        sharp(file.buffer)
          .rotate()
          .resize(AVATAR_SIZES.thumbnail, AVATAR_SIZES.thumbnail, {
            fit: 'cover',
          }),
        format,
      ),
      this.encode(
        sharp(file.buffer)
          .rotate()
          .resize(AVATAR_SIZES.small, AVATAR_SIZES.small, { fit: 'cover' }),
        format,
      ),
      this.encode(
        sharp(file.buffer)
          .rotate()
          .resize(AVATAR_SIZES.medium, AVATAR_SIZES.medium, { fit: 'cover' }),
        format,
      ),
    ]);

    const [avatarUrl, avatarThumbnailUrl, avatarSmallUrl, avatarMediumUrl] =
      await Promise.all([
        this.storage.upload(`${prefix}-original.${ext}`, originalBuf, mime),
        this.storage.upload(`${prefix}-thumbnail.${ext}`, thumbnailBuf, mime),
        this.storage.upload(`${prefix}-small.${ext}`, smallBuf, mime),
        this.storage.upload(`${prefix}-medium.${ext}`, mediumBuf, mime),
      ]);

    user.avatarUrl = avatarUrl;
    user.avatarThumbnailUrl = avatarThumbnailUrl;
    user.avatarSmallUrl = avatarSmallUrl;
    user.avatarMediumUrl = avatarMediumUrl;
    await this.users.save(user);
    await this.completeness.invalidate(normalizedAddress);

    await Promise.all(previousUrls.map((url) => this.storage.deleteByUrl(url)));

    this.logger.log(
      `avatar_uploaded address=${normalizedAddress} format=${format}`,
    );
    return {
      avatarUrl,
      avatarThumbnailUrl,
      avatarSmallUrl,
      avatarMediumUrl,
    };
  }

  private validatePreProcess(
    file: AvatarUploadFile | undefined,
  ): asserts file is AvatarUploadFile {
    if (!file) {
      throw new BadRequestException('No image file uploaded.');
    }
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      throw new BadRequestException(
        'Unsupported image type. Only JPEG, PNG, and WebP are allowed.',
      );
    }
    const byteLength = Math.max(file.size ?? 0, file.buffer?.length ?? 0);
    if (byteLength === 0 || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Uploaded image file is empty.');
    }
    if (byteLength > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Avatar image must not exceed 5MB.');
    }
  }

  private encode(
    pipeline: sharp.Sharp,
    format: 'jpeg' | 'png' | 'webp',
  ): Promise<Buffer> {
    if (format === 'jpeg') {
      return pipeline.jpeg({ quality: 80, progressive: true }).toBuffer();
    }
    if (format === 'png') {
      return pipeline.png({ quality: 80, compressionLevel: 8 }).toBuffer();
    }
    return pipeline.webp({ quality: 80 }).toBuffer();
  }
}
