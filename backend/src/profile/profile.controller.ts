import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { Role } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  InternalServerErrorResponseDto,
  TooManyRequestsResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import {
  CreateMenteeProfileDto,
  MenteeProfileWithCompletionDto,
  UpdateMenteeProfileDto,
} from './dto/mentee-profile.dto';
import {
  CreateProfileResponseDto,
  UpdateProfileResponseDto,
} from './dto/profile-response.dto';
import {
  UpdateProfileDto,
  ProfileTypeParamDto,
} from './dto/update-profile.dto';
import { ProfileService } from './profile.service';
import { ProfileUpdateRateLimitGuard } from './profile-update-rate-limit.guard';

@ApiTags('Profiles')
@ApiBearerAuth('BearerAuth')
@UseGuards(JwtAuthGuard)
@Controller('user')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @ApiOperation({
    summary: 'Create a mentor or mentee profile',
    description:
      'Creates a new mentor or mentee profile for the authenticated user. ' +
      'A user may hold at most one mentor profile and one mentee profile. ' +
      "On success the user's role is automatically updated to include the new profile type. " +
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
    description:
      'Request body failed validation. See the errors array for per-field details.',
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
    description:
      'A profile of the requested type already exists for this user.',
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

  @ApiOperation({
    summary: 'Update a mentor or mentee profile',
    description:
      'Partially updates the authenticated user profile. Admins may provide walletAddress to update another user.',
    operationId: 'updateProfile',
  })
  @ApiParam({ name: 'type', enum: ['mentor', 'mentee'] })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Profile updated successfully.',
    type: UpdateProfileResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'One or more fields failed validation.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Only the owner or an admin may update this profile.',
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Profile not found.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Profile update limit exceeded.',
    type: TooManyRequestsResponseDto,
  })
  @Patch('profile/:type')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ProfileUpdateRateLimitGuard)
  updateProfile(
    @Param() params: ProfileTypeParamDto,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UpdateProfileResponseDto> {
    return this.profileService.updateProfile(params.type, user, dto);
  }

  @ApiOperation({
    summary: 'Get my mentee profile',
    description:
      'Returns the mentee profile and completion metrics for a user with the mentee role.',
    operationId: 'getMenteeProfile',
  })
  @ApiResponse({ status: HttpStatus.OK, type: MenteeProfileWithCompletionDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  @Get('mentee-profile')
  @UseGuards(RolesGuard)
  @Roles(Role.MENTEE, Role.ADMIN)
  getMenteeProfile(
    @CurrentUser() user: AuthUser,
  ): Promise<MenteeProfileWithCompletionDto> {
    return this.profileService.getMenteeProfile(user);
  }

  @ApiOperation({
    summary: 'Create my mentee profile (mentee role required)',
    operationId: 'createMenteeProfile',
  })
  @ApiBody({ type: CreateMenteeProfileDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: MenteeProfileWithCompletionDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @Post('mentee-profile')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RolesGuard)
  @Roles(Role.MENTEE, Role.ADMIN)
  createMenteeProfile(
    @Body() dto: CreateMenteeProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MenteeProfileWithCompletionDto> {
    return this.profileService.createMenteeProfileForRole(user, dto);
  }

  @ApiOperation({
    summary: 'Update my mentee profile (mentee role required)',
    operationId: 'updateMenteeProfile',
  })
  @ApiBody({ type: UpdateMenteeProfileDto })
  @ApiResponse({ status: HttpStatus.OK, type: MenteeProfileWithCompletionDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @Patch('mentee-profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, ProfileUpdateRateLimitGuard)
  @Roles(Role.MENTEE, Role.ADMIN)
  updateMenteeProfile(
    @Body() dto: UpdateMenteeProfileDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MenteeProfileWithCompletionDto> {
    return this.profileService.updateMenteeProfileForRole(user, dto);
  }

  @ApiOperation({
    summary: 'Delete my mentee profile (mentee role required)',
    operationId: 'deleteMenteeProfile',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @Delete('mentee-profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.MENTEE, Role.ADMIN)
  deleteMenteeProfile(@CurrentUser() user: AuthUser): Promise<void> {
    return this.profileService.deleteMenteeProfile(user);
  }
}
