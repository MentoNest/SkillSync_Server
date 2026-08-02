import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AvatarService } from './avatar.service.js';
import { AvatarResponseDto } from './dto/avatar-response.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtAccessTokenPayload } from '../auth/interfaces/jwt-payload.interface.js';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Post('avatar')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: JwtAccessTokenPayload },
  ): Promise<AvatarResponseDto> {
    return this.avatarService.uploadAvatar(req.user.sub, file);
  }
}
