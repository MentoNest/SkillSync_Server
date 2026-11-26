import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletIdentifierParamDto } from '../common/dto/base.dto';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  InternalServerErrorResponseDto,
  TooManyRequestsResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import { AvatarService, MAX_AVATAR_BYTES } from './avatar.service';
import {
  AvatarUploadResponseDto,
  PaginatedUsersResponseDto,
  PublicProfileResponseDto,
  QueryUserDto,
  SetDisplayNameDto,
  SetUsernameDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UserResponseDto,
  UsernameAvailableQueryDto,
  UsernameAvailableResponseDto,
} from './dto';
import { User } from './user.entity';
import { UserService } from './user.service';
import { resolveTimezone } from '../common/utils/timezone.utils';

@ApiTags('Users')
@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
    @Optional() private readonly avatarService?: AvatarService,
  ) {}

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Get('users/me')
  @ApiHeader({
    name: 'Accept-Timezone',
    required: false,
    description: 'IANA timezone override for this response.',
  })
  @ApiOperation({ summary: 'Get my profile', operationId: 'getMyProfile' })
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseDto })
  async getMe(
    @CurrentUser() user: AuthUser,
    @Headers('accept-timezone') timezone?: string,
  ): Promise<UserResponseDto> {
    const profile = await this.userService.findMe(user.address);
    return {
      ...profile,
      timezone: resolveTimezone(profile.timezone, timezone),
    };
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Patch('users/me')
  @ApiHeader({
    name: 'Accept-Timezone',
    required: false,
    description: 'IANA timezone override for this response.',
  })
  @ApiOperation({
    summary: 'Update my profile',
    operationId: 'updateMyProfile',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  async updateMe(
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @Headers('accept-timezone') timezone?: string,
  ): Promise<UserResponseDto> {
    const profile = await this.userService.updateMe(user.address, dto);
    return {
      ...profile,
      timezone: resolveTimezone(profile.timezone, timezone),
    };
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Delete('users/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete my account',
    operationId: 'deleteMyProfile',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async removeMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.userService.removeMe(user.address);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Post('user/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upload profile avatar image',
    description:
      'Uploads and optimizes a profile image (JPEG, PNG, or WebP; max 5MB; 200x200 to 2000x2000 px) ' +
      'and generates original, thumbnail (64x64), small (200x200), and medium (400x400) variants.',
    operationId: 'uploadAvatar',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.OK, type: AvatarUploadResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    type: UnauthorizedResponseDto,
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // Allow slightly over 5MB through Multer so AvatarService rejects >5MB with HTTP 400 before processing.
      limits: { fileSize: MAX_AVATAR_BYTES + 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<AvatarUploadResponseDto> {
    if (!this.avatarService) {
      throw new BadRequestException('Avatar upload service is unavailable.');
    }
    return this.avatarService.uploadAvatar(user.address, file);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/users/:walletAddress/status')
  @ApiOperation({
    summary: 'Change an account status (admin)',
    operationId: 'setUserStatus',
  })
  @ApiParam({
    name: 'walletAddress',
    description: 'Wallet address of the account to update.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseDto })
  setStatus(
    @Param('walletAddress') walletAddress: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.userService.setStatus(walletAddress, dto.status);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Get('users')
  @ApiOperation({ summary: 'List users (query)', operationId: 'listUsers' })
  @ApiResponse({ status: HttpStatus.OK, type: PaginatedUsersResponseDto })
  listUsers(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Get('user/username/available')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check username availability',
    operationId: 'checkUsernameAvailability',
  })
  @ApiQuery({
    name: 'username',
    description: 'Username to check.',
    example: 'alice_dev',
  })
  @ApiResponse({ status: HttpStatus.OK, type: UsernameAvailableResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  checkAvailability(
    @Query() query: UsernameAvailableQueryDto,
  ): Promise<UsernameAvailableResponseDto> {
    return this.userService.checkAvailability(query.username);
  }

  @ApiBearerAuth('BearerAuth')
  @Patch('user/username')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Set or change username',
    operationId: 'setUsername',
  })
  @ApiResponse({ status: HttpStatus.OK, type: User })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    type: TooManyRequestsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    type: InternalServerErrorResponseDto,
  })
  setUsername(
    @Body() dto: SetUsernameDto,
    @CurrentUser() user: AuthUser,
  ): Promise<User> {
    return this.userService.setUsername(user.address, dto.username);
  }

  @ApiBearerAuth('BearerAuth')
  @Patch('user/display-name')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Set or clear display name',
    operationId: 'setDisplayName',
  })
  @ApiResponse({ status: HttpStatus.OK, type: User })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    type: TooManyRequestsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    type: InternalServerErrorResponseDto,
  })
  setDisplayName(
    @Body() dto: SetDisplayNameDto,
    @CurrentUser() user: AuthUser,
  ): Promise<User> {
    return this.userService.setDisplayName(user.address, dto.displayName);
  }

  @Get('profiles/:identifier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get public profile',
    operationId: 'getPublicProfile',
  })
  @ApiParam({
    name: 'identifier',
    description: 'Wallet address or username',
    example: 'alice_dev',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PublicProfileResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  getPublicProfile(
    @Param() params: WalletIdentifierParamDto,
  ): Promise<PublicProfileResponseDto> {
    return this.userService.getPublicProfile(params.identifier);
  }
}
