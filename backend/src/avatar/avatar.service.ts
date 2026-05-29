import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { User } from '../users/entities/user.entity';
import { UploadedAvatarResult } from './dto/avatar.dto';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

interface SharpInstance {
  resize(w: number, h: number, opts?: object): SharpInstance;
  jpeg(opts?: object): SharpInstance;
  toBuffer(): Promise<Buffer>;
  metadata(): Promise<{ width?: number; height?: number }>;
}

// Lazy-load sharp so the app still starts without it installed
async function getSharp(): Promise<(input: Buffer) => SharpInstance> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('sharp') as (input: Buffer) => SharpInstance);
  } catch {
    throw new InternalServerErrorException('Image processing library not available');
  }
}

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<UploadedAvatarResult> {
    this.validateFile(file);

    const sharp = await getSharp();
    const img = sharp(file.buffer);
    const meta = await img.metadata();

    if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) {
      throw new BadRequestException('Image must be at least 200x200 pixels');
    }

    const sizes: Record<string, [number, number]> = {
      original: [Math.min(meta.width ?? 2000, 2000), Math.min(meta.height ?? 2000, 2000)],
      thumbnail: [64, 64],
      small: [200, 200],
      medium: [400, 400],
    };

    const urls: Record<string, string> = {};
    for (const [name, [w, h]] of Object.entries(sizes)) {
      const buf = await sharp(file.buffer)
        .resize(w, h, { fit: 'cover' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();
      urls[name] = await this.store(userId, name, buf);
    }

    // Delete old avatars if local storage
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user?.avatarUrl) await this.deleteOld(user.avatarUrl);
    if (user?.avatarThumbnailUrl) await this.deleteOld(user.avatarThumbnailUrl);

    await this.userRepo.update(userId, {
      avatarUrl: urls['original'],
      avatarThumbnailUrl: urls['thumbnail'],
    });

    return { avatarUrl: urls['original'], avatarThumbnailUrl: urls['thumbnail'] };
  }

  // ── Storage ────────────────────────────────────────────────────────────────

  private async store(userId: string, size: string, buf: Buffer): Promise<string> {
    const useS3 = !!this.config.get<string>('AWS_ACCESS_KEY_ID');
    if (useS3) return this.storeS3(userId, size, buf);
    return this.storeLocal(userId, size, buf);
  }

  private async storeLocal(userId: string, size: string, buf: Buffer): Promise<string> {
    const uploadDir = this.config.get<string>('UPLOAD_DIR') ?? path.join(process.cwd(), 'uploads', 'avatars');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filename = `${userId}-${size}-${randomUUID()}.jpg`;
    fs.writeFileSync(path.join(uploadDir, filename), buf);
    const baseUrl = this.config.get<string>('BASE_URL') ?? 'http://localhost:3000';
    return `${baseUrl}/uploads/avatars/${filename}`;
  }

  private async storeS3(userId: string, size: string, buf: Buffer): Promise<string> {
    // Lazy-load AWS SDK (optional dependency)
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const awsSdk = require('@aws-sdk/client-s3') as any;
    const bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');
    const region = this.config.get<string>('AWS_REGION') ?? 'us-east-1';
    const key = `avatars/${userId}/${size}-${randomUUID()}.jpg`;

    const client = new awsSdk.S3Client({ region }) as { send: (cmd: unknown) => Promise<void> };
    await client.send(new awsSdk.PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: 'image/jpeg' }));
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  private async deleteOld(url: string): Promise<void> {
    try {
      const baseUrl = this.config.get<string>('BASE_URL') ?? 'http://localhost:3000';
      if (url.startsWith(baseUrl)) {
        const filePath = url.replace(baseUrl, process.cwd());
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (e) {
      this.logger.warn(`Failed to delete old avatar: ${String(e)}`);
    }
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  private validateFile(file: Express.Multer.File): void {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are allowed');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File size must not exceed 5MB');
    }
  }
}
