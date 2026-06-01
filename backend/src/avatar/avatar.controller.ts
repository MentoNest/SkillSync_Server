import {
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AvatarService } from './avatar.service';

@Controller('user/avatar')
@UseGuards(JwtAuthGuard)
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadAvatar(
    @Req() req: Request & { user?: JwtPayload },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.avatarService.uploadAvatar(req.user!.sub, file);
  }
}
