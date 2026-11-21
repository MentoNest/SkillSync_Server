import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  InternalServerErrorResponseDto,
  TooManyRequestsResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import {
  PublicProfileResponseDto,
  SetDisplayNameDto,
  SetUsernameDto,
  UsernameAvailableQueryDto,
  UsernameAvailableResponseDto,
} from './dto';
import { User } from './user.entity';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ─── Availability (public, no auth) ─────────────────────────────────────────

  @ApiOperation({
    summary: 'Check username availability',
    description:
      'Returns whether a username is both syntactically valid and not already taken. ' +
      'No authentication required. Useful for inline validation in sign-up forms.',
    operationId: 'checkUsernameAvailability',
  })
  @ApiQuery({ name: 'username', description: 'Username to check.', example: 'alice_dev' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Availability result. Check the `available` field.',
    type: UsernameAvailableResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Query parameter failed validation.', type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Get('user/username/available')
  @HttpCode(HttpStatus.OK)
  checkAvailability(@Query() query: UsernameAvailableQueryDto): Promise<UsernameAvailableResponseDto> {
    return this.userService.checkAvailability(query.username);
  }

  // ─── Set / change username (authenticated) ───────────────────────────────────

  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Set or change username',
    description:
      'Sets or updates the authenticated user\'s unique username. ' +
      'The first username can be set at any time. Subsequent changes require a 30-day cooldown ' +
      'since the last change. Usernames are stored in lowercase and must be unique across all accounts.',
    operationId: 'setUsername',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Username updated. Returns the full updated user record.',
    type: User,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Body failed validation.', type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid access token.', type: UnauthorizedResponseDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Insufficient role.', type: ForbiddenResponseDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Username is already taken by another account.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Cooldown period has not elapsed, or username fails a business rule.',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Patch('user/username')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  setUsername(@Body() dto: SetUsernameDto, @CurrentUser() user: AuthUser): Promise<User> {
    return this.userService.setUsername(user.address, dto.username);
  }

  // ─── Set / change display name (authenticated) ───────────────────────────────

  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({
    summary: 'Set or clear display name',
    description:
      'Updates the authenticated user\'s display name. Send null or omit the field to reset ' +
      'it to the default (first 8 characters of the wallet address). No uniqueness constraint.',
    operationId: 'setDisplayName',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Display name updated.', type: User })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Body failed validation.', type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid access token.', type: UnauthorizedResponseDto })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Patch('user/display-name')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  setDisplayName(@Body() dto: SetDisplayNameDto, @CurrentUser() user: AuthUser): Promise<User> {
    return this.userService.setDisplayName(user.address, dto.displayName);
  }

  // ─── Public profile ──────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Get public profile',
    description:
      'Returns the public profile for a user identified by their wallet address OR their username. ' +
      'No authentication required.',
    operationId: 'getPublicProfile',
  })
  @ApiParam({
    name: 'identifier',
    description: 'Stellar wallet address (56 chars) or the user\'s chosen username.',
    example: 'alice_dev',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Profile found.', type: PublicProfileResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No user found for this identifier.', type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded.', type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Get('profiles/:identifier')
  @HttpCode(HttpStatus.OK)
  getPublicProfile(@Param('identifier') identifier: string): Promise<PublicProfileResponseDto> {
    return this.userService.getPublicProfile(identifier);
  }
}
