import { Controller, Get, Patch, Body, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UserService } from './providers/user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './entities/user.entity';
import { RolesGuard } from './guard/roles.guard';
import { Roles } from './decorators/roles.decorator';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
@UseGuards(RolesGuard)
export class ProfileController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @Roles('MENTOR', 'MENTEE')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns the current user profile', type: User })
  getProfile(@CurrentUser() user: User) {
    return user;
  }

  @Patch('me')
  @Roles('MENTOR', 'MENTEE')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully', type: User })
  updateProfile(@CurrentUser() user: User, @Body() updateProfileDto: UpdateProfileDto) {
    return this.userService.update(user.id, updateProfileDto);
  }

  @Patch('me/picture')
  @Roles('MENTOR', 'MENTEE')
  @UseInterceptors(FileInterceptor('picture', {
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
        return cb(new BadRequestException('Only image files are allowed!'), false);
      }
      cb(null, true);
    },
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  }))
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
  @ApiResponse({ status: 200, description: 'Profile picture updated successfully', type: User })
  async uploadProfilePicture(@CurrentUser() user: User, @UploadedFile() file: Express.Multer.File) {
    const profilePicture = `profile-pictures/${file.filename}`;
    return this.userService.update(user.id, { profilePicture });
  }
} 