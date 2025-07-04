import {
  Controller,
  Get,
  Patch,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './providers/profile.service';
import { RolesDecorator } from 'src/common/decorators/roles.decorator';
import { userRole } from 'src/common/enums/role.enum';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
// @UseGuards(RolesGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService
  ) {}

  @Get('me')
  @RolesDecorator(userRole.MENTOR, userRole.MENTEE)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns the current user profile',
    type: User,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  getProfile(@CurrentUser() user: User) {
    return this.profileService.getProfile(user.id);
  }

  @Patch('me')
  @RolesDecorator(userRole.MENTOR, userRole.MENTEE)
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: User,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  public updateProfile(
    @CurrentUser() user: User,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(user.id, updateProfileDto);
  }

  @Patch('me/picture')
  @RolesDecorator(userRole.MENTOR, userRole.MENTEE)
  @UseInterceptors(
    FileInterceptor('picture', {
      storage: diskStorage({
        destination: './uploads/profile-pictures',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          return cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
          return cb(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  @ApiOperation({ summary: 'Upload profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        picture: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile picture updated successfully',
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid file type or size',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  public async uploadProfilePicture(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const profilePicture = `profile-pictures/${file.filename}`;
    return this.profileService.updateProfilePicture(user.id, profilePicture);
  }
}
