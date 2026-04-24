import { Injectable, BadRequestException } from '@nestjs/common';
import * as sharp from 'sharp';
import { StorageService } from '../storage/storage.service';
import { UserRepository } from './user.repository';

@Injectable()
export class AvatarService {
  constructor(
    private readonly storageService: StorageService,
    private readonly userRepository: UserRepository,
  ) {}

  async processAndSaveAvatar(userId: string, file: Express.Multer.File) {
    // Validate type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type');
    }

    // Validate dimensions
    const image = sharp(file.buffer);
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width < 200 ||
      metadata.height < 200 ||
      metadata.width > 2000 ||
      metadata.height > 2000
    ) {
      throw new BadRequestException('Invalid image dimensions');
    }

    // Optimize and generate sizes
    const original = await image.jpeg({ quality: 80, progressive: true }).toBuffer();
    const thumbnail = await image.resize(64, 64).jpeg({ quality: 80 }).toBuffer();
    const small = await image.resize(200, 200).jpeg({ quality: 80 }).toBuffer();
    const medium = await image.resize(400, 400).jpeg({ quality: 80 }).toBuffer();

    // Save to storage (local or S3)
    const urls = await this.storageService.saveAll(userId, {
      original,
      thumbnail,
      small,
      medium,
    });

    // Delete old avatar images
    await this.storageService.deleteOld(userId);

    // Update user entity with new URLs
    await this.userRepository.update(userId, {
      avatarUrl: urls.original,
      avatarThumbnailUrl: urls.thumbnail,
      avatarSmallUrl: urls.small,
      avatarMediumUrl: urls.medium,
    });

    return urls;
  }
}
