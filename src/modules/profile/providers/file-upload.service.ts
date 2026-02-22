import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { File } from 'buffer';

@Injectable()
export class FileUploadService {
  constructor(private configService: ConfigService) {}

  validateFile(file: Express.Multer.File): void {
    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size too large. Maximum size is 5MB');
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed');
    }
  }

  async saveFile(file: Express.Multer.File, folder: string = 'profile-images'): Promise<string> {
    this.validateFile(file);

    // Create upload directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'uploads', folder);
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `${timestamp}-${file.originalname}`;
    const filepath = join(uploadDir, filename);

    // Save file
    writeFileSync(filepath, file.buffer);

    // Return relative URL
    return `/uploads/${folder}/${filename}`;
  }

  getFileUrl(filename: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return `${baseUrl}${filename}`;
  }
}
