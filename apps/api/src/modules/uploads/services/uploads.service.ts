import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FileStoragePort } from '../interfaces/file-storage.port';
import { FILE_STORAGE_PORT, UPLOAD_PATHS } from '../uploads.constants';
import { User } from '../../../entities/user.entity';

@Injectable()
export class UploadsService {
  private readonly maxFileSize: number;

  constructor(
    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.maxFileSize = this.configService.get<number>(
      'upload.maxFileSize',
      5242880,
    );
  }

  validateFile(file: Express.Multer.File, allowedMimeTypes: string[]): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum of ${this.maxFileSize} bytes`,
      );
    }

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`,
      );
    }
  }

  generateFilename(originalName: string, prefix: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop();
    return `${timestamp}-${random}${prefix ? `-${prefix}` : ''}.${extension}`;
  }

async uploadAvatar(file: Express.Multer.File, userId: string): Promise<string> {
  const filename = this.generateFilename(file.originalname, 'avatar');
  const destinationPath = `${UPLOAD_PATHS.AVATARS}/${filename}`;

  const user = await this.userRepository.findOne({ where: { id: userId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }

  if (user.avatarUrl) {
    await this.fileStorage.delete(user.avatarUrl).catch(() => {});
  }

  const url = await this.fileStorage.save(file, destinationPath);
  await this.userRepository.update(userId, { avatarUrl: url });

  return url;
}
}