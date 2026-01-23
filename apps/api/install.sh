#!/bin/bash

# Auto-installer from ALL_IMPLEMENTATION_FILES.txt
# Run from project root: /workspaces/SkillSync_Server

set -e

echo "🚀 Installing File Upload Implementation..."

# Create directories
mkdir -p apps/api/src/modules/uploads/{adapters,controllers,interfaces,services,tests}
mkdir -p apps/api/src/config
mkdir -p apps/api/src/modules/uploads/config
mkdir -p apps/api/src/migrations
mkdir -p uploads/{avatars,documents}

# Install dependencies
echo "📦 Installing dependencies..."
npm install @nestjs/platform-express multer @types/multer

# Add to .env
echo "⚙️  Updating .env..."
if ! grep -q "MAX_FILE_SIZE" .env 2>/dev/null; then
  echo -e "\n# File Upload Configuration\nMAX_FILE_SIZE=5242880\nUPLOAD_DIR=./uploads" >> .env
fi

# Create file-storage.port.ts
cat > apps/api/src/modules/uploads/interfaces/file-storage.port.ts << 'EOF'
export interface FileStoragePort {
  /**
   * Save a file to storage
   * @param file - The uploaded file
   * @param destinationPath - Relative path where file should be stored
   * @returns The public URL/path to access the file
   */
  save(file: Express.Multer.File, destinationPath: string): Promise<string>;

  /**
   * Delete a file from storage
   * @param filePath - The path/URL of the file to delete
   */
  delete(filePath: string): Promise<void>;
}
EOF

# Create uploads.constants.ts
cat > apps/api/src/modules/uploads/uploads.constants.ts << 'EOF'
export const FILE_STORAGE_PORT = 'FILE_STORAGE_PORT';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];

export const UPLOAD_PATHS = {
  AVATARS: 'avatars',
  DOCUMENTS: 'documents',
} as const;
EOF

# Create local-file-storage.adapter.ts
cat > apps/api/src/modules/uploads/adapters/local-file-storage.adapter.ts << 'EOF'
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

  async save(file: Express.Multer.File, destinationPath: string): Promise<string> {
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
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
EOF

# Create upload.config.ts
cat > apps/api/src/modules/uploads/config/upload.config.ts << 'EOF'
import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => ({
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB default
  uploadDir: process.env.UPLOAD_DIR || './uploads',
}));
EOF

# Create uploads.service.ts
cat > apps/api/src/modules/uploads/services/uploads.service.ts << 'EOF'
import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileStoragePort } from '../interfaces/file-storage.port';
import { FILE_STORAGE_PORT, UPLOAD_PATHS } from '../uploads.constants';

@Injectable()
export class UploadsService {
  private readonly maxFileSize: number;

  constructor(
    @Inject(FILE_STORAGE_PORT)
    private readonly fileStorage: FileStoragePort,
    private readonly configService: ConfigService,
  ) {
    this.maxFileSize = this.configService.get<number>(
      'upload.maxFileSize',
      5242880,
    );
  }

  /**
   * Validate file size and mime type
   */
  validateFile(
    file: Express.Multer.File,
    allowedMimeTypes: string[],
  ): void {
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

  /**
   * Generate unique filename
   */
  generateFilename(originalName: string, prefix: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split('.').pop();
    return `${timestamp}-${random}${prefix ? `-${prefix}` : ''}.${extension}`;
  }

  /**
   * Upload avatar
   */
  async uploadAvatar(
    file: Express.Multer.File,
    userId: number,
    userRepository: Repository<any>,
  ): Promise<string> {
    const filename = this.generateFilename(file.originalname, 'avatar');
    const destinationPath = `${UPLOAD_PATHS.AVATARS}/${filename}`;

    // Delete old avatar if exists
    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.avatarUrl) {
      await this.fileStorage.delete(user.avatarUrl).catch(() => {
        // Ignore deletion errors
      });
    }

    // Upload new avatar
    const url = await this.fileStorage.save(file, destinationPath);

    // Update user
    await userRepository.update(userId, { avatarUrl: url });

    return url;
  }

  /**
   * Upload mentor document
   */
  async uploadMentorDocument(
    file: Express.Multer.File,
    userId: number,
    mentorProfileRepository: Repository<any>,
  ): Promise<string> {
    const filename = this.generateFilename(file.originalname, 'document');
    const destinationPath = `${UPLOAD_PATHS.DOCUMENTS}/${filename}`;

    // Get mentor profile
    const mentorProfile = await mentorProfileRepository.findOne({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new NotFoundException('Mentor profile not found');
    }

    // Delete old document if exists
    if (mentorProfile.documentUrl) {
      await this.fileStorage.delete(mentorProfile.documentUrl).catch(() => {
        // Ignore deletion errors
      });
    }

    // Upload new document
    const url = await this.fileStorage.save(file, destinationPath);

    // Update mentor profile
    await mentorProfileRepository.update(
      { userId },
      { documentUrl: url },
    );

    return url;
  }
}
EOF

# Create uploads.controller.ts
cat > apps/api/src/modules/uploads/controllers/uploads.controller.ts << 'EOF'
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UploadsService } from '../services/uploads.service';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
} from '../uploads.constants';

// Import your auth guard and entities
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
// import { User } from '../../entities/user.entity';
// import { MentorProfile } from '../../entities/mentor-profile.entity';

@ApiTags('uploads')
@Controller('uploads')
// @UseGuards(JwtAuthGuard) // Uncomment when integrating
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    @InjectRepository('User') // Replace with actual User entity
    private readonly userRepository: Repository<any>,
    @InjectRepository('MentorProfile') // Replace with actual MentorProfile entity
    private readonly mentorProfileRepository: Repository<any>,
  ) {}

  @Post('avatar')
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Avatar uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: '/uploads/avatars/1234567890-avatar.jpg' },
        message: { type: 'string', example: 'Avatar uploaded successfully' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 1; // Replace with actual user ID from JWT

    this.uploadsService.validateFile(file, ALLOWED_IMAGE_TYPES);

    const url = await this.uploadsService.uploadAvatar(
      file,
      userId,
      this.userRepository,
    );

    return {
      url,
      message: 'Avatar uploaded successfully',
    };
  }

  @Post('mentor-document')
  @ApiOperation({ summary: 'Upload mentor verification document' })
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Document uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: '/uploads/documents/1234567890-document.pdf' },
        message: { type: 'string', example: 'Document uploaded successfully' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a mentor' })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadMentorDocument(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    const userId = req.user?.id || 1; // Replace with actual user ID from JWT

    // Check if user is a mentor
    const mentorProfile = await this.mentorProfileRepository.findOne({
      where: { userId },
    });

    if (!mentorProfile) {
      throw new ForbiddenException('Only mentors can upload documents');
    }

    this.uploadsService.validateFile(file, ALLOWED_DOCUMENT_TYPES);

    const url = await this.uploadsService.uploadMentorDocument(
      file,
      userId,
      this.mentorProfileRepository,
    );

    return {
      url,
      message: 'Document uploaded successfully',
    };
  }
}
EOF

# Create uploads.module.ts
cat > apps/api/src/modules/uploads/uploads.module.ts << 'EOF'
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadsController } from './controllers/uploads.controller';
import { UploadsService } from './services/uploads.service';
import { LocalFileStorageAdapter } from './adapters/local-file-storage.adapter';
import { FILE_STORAGE_PORT } from './uploads.constants';
import uploadConfig from './config/upload.config';

// Import your entities
// import { User } from '../entities/user.entity';
// import { MentorProfile } from '../entities/mentor-profile.entity';

@Module({
  imports: [
    ConfigModule.forFeature(uploadConfig),
    // TypeOrmModule.forFeature([User, MentorProfile]), // Uncomment and use actual entities
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: FILE_STORAGE_PORT,
      useClass: LocalFileStorageAdapter,
    },
    // Temporary providers - replace with actual entities
    {
      provide: 'UserRepository',
      useValue: {},
    },
    {
      provide: 'MentorProfileRepository',
      useValue: {},
    },
  ],
  exports: [UploadsService, FILE_STORAGE_PORT],
})
export class UploadsModule {}
EOF

# Create migration
TIMESTAMP=$(date +%s)
cat > apps/api/src/migrations/${TIMESTAMP}-add-upload-fields.ts << 'EOF'
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUploadFields1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add avatarUrl to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'avatarUrl',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );

    // Add documentUrl to mentor_profiles table
    await queryRunner.addColumn(
      'mentor_profiles',
      new TableColumn({
        name: 'documentUrl',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'avatarUrl');
    await queryRunner.dropColumn('mentor_profiles', 'documentUrl');
  }
}
EOF

# Update .gitignore
if ! grep -q "uploads/" .gitignore 2>/dev/null; then
  echo -e "\n# Uploads\nuploads/*\n!uploads/.gitkeep" >> .gitignore
fi

touch uploads/.gitkeep

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Add avatarUrl field to User entity"
echo "2. Add documentUrl field to MentorProfile entity"
echo "3. Import UploadsModule in app.module.ts"
echo "4. Add static file serving in main.ts (see INTEGRATION_GUIDE.md)"
echo "5. Update uploads.controller.ts and uploads.module.ts with actual entities"
echo "6. Run: npm run migration:run"
echo "7. Test: npm run start:dev"
echo ""
EOF