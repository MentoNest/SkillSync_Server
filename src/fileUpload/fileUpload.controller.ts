import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { FileUploadService } from './providers/fileUpload.service';
import { UserService } from 'src/user/providers/user.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@Controller('upload')
export class FileUploadController {
  constructor(
    private readonly uploadService: FileUploadService,
    private readonly usersService: UserService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('profile-image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadProfileImage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    const result = await this.uploadService.uploadImage(file);
    await this.usersService.updateProfileImage(req.user.id, result.secure_url);
    return { imageUrl: result.secure_url };
  }
}
