import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { AvatarService, AvatarUrls } from './avatar.service';

@ApiTags('user')
@Controller('user/avatar')
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Post()
  @ApiOperation({ summary: 'Upload the authenticated user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOkResponse({ description: 'Generated avatar URLs' })
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser('sub') userId: string, @UploadedFile() file: Express.Multer.File): Promise<AvatarUrls> {
    return this.avatars.uploadAvatar(userId, file);
  }
}
