import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  InternalServerErrorResponseDto,
  TooManyRequestsResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { CreateProfileResponseDto } from './dto/profile-response.dto';
import { ProfileService } from './profile.service';

@ApiTags('Profiles')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard)
@Controller('user')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @ApiOperation({
    summary: 'Create a mentor or mentee profile',
    description:
      'Creates a new mentor or mentee profile for the authenticated user. ' +
      'A user may hold at most one mentor profile and one mentee profile. ' +
      'On success the user\'s role is automatically updated to include the new profile type. ' +
      'Returns the full created profile with all timestamps.',
    operationId: 'createProfile',
  })
  @ApiBody({ type: CreateProfileDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Profile created successfully.',
    type: CreateProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Request body failed validation. See the errors array for per-field details.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid access token.',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Insufficient role.',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'A profile of the requested type already exists for this user.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded.',
    type: TooManyRequestsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Unexpected server error.',
    type: InternalServerErrorResponseDto,
  })
  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  createProfile(
    @Body() dto: CreateProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CreateProfileResponseDto> {
    return this.profileService.createProfile(user.address, dto);
  }
}
