import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Request,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { FileUploadService } from './providers/file-upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MentorProfileService } from './providers/mentor-profile.service';
import { MenteeProfileService } from './providers/mentee-profile.service';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('file-upload')
@ApiBearerAuth()
@Controller('upload')
@UseGuards(JwtAuthGuard)
export class FileUploadController {
  constructor(
    private readonly fileUploadService: FileUploadService,
    private readonly mentorProfileService: MentorProfileService,
    private readonly menteeProfileService: MenteeProfileService,
  ) {}

  @Post('mentor-profile-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload mentor profile image' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Profile image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload failed' })
  async uploadMentorProfileImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Request() req,
  ) {
    try {
      const fileUrl = await this.fileUploadService.saveFile(file, 'mentor-profiles');
      
      // Update mentor profile with new image URL
      const mentorProfile = await this.mentorProfileService.findByUserId(req.user.id);
      await this.mentorProfileService.update(mentorProfile.id, { profileImageUrl: fileUrl });
      
      return {
        message: 'Mentor profile image uploaded successfully',
        fileUrl: this.fileUploadService.getFileUrl(fileUrl),
      };
    } catch (error) {
      throw new BadRequestException('Failed to upload mentor profile image');
    }
  }

  @Post('mentee-profile-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload mentee profile image' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Profile image uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload failed' })
  async uploadMenteeProfileImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpeg|jpg|png|gif|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Request() req,
  ) {
    try {
      const fileUrl = await this.fileUploadService.saveFile(file, 'mentee-profiles');
      
      // Update mentee profile with new image URL
      const menteeProfile = await this.menteeProfileService.findByUserId(req.user.id);
      await this.menteeProfileService.update(menteeProfile.id, { profileImageUrl: fileUrl });
      
      return {
        message: 'Mentee profile image uploaded successfully',
        fileUrl: this.fileUploadService.getFileUrl(fileUrl),
      };
    } catch (error) {
      throw new BadRequestException('Failed to upload mentee profile image');
    }
  }
}
