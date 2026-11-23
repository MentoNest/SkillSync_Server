import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import {
  PaginatedUsersResponseDto,
  PublicProfileResponseDto,
  QueryUserDto,
  SetDisplayNameDto,
  SetUsernameDto,
  UpdateUserDto,
  UserResponseDto,
  UsernameAvailableQueryDto,
  UsernameAvailableResponseDto,
} from './dto';
import { User } from './user.entity';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Get('users/me')
  @ApiOperation({ summary: 'Get my profile', operationId: 'getMyProfile' })
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseDto })
  getMe(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.userService.findMe(user.address);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Patch('users/me')
  @ApiOperation({ summary: 'Update my profile', operationId: 'updateMyProfile' })
  @ApiResponse({ status: HttpStatus.OK, type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  updateMe(@Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.userService.updateMe(user.address, dto);
  }

  @ApiBearerAuth('BearerAuth')
  @UseGuards(JwtAuthGuard)
  @Delete('users/me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete my account', operationId: 'deleteMyProfile' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async removeMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.userService.removeMe(user.address);
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
  @ApiOperation({ summary: 'Check username availability', operationId: 'checkUsernameAvailability' })
  @ApiQuery({ name: 'username', description: 'Username to check.', example: 'alice_dev' })
  @ApiResponse({ status: HttpStatus.OK, type: UsernameAvailableResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  checkAvailability(@Query() query: UsernameAvailableQueryDto): Promise<UsernameAvailableResponseDto> {
    return this.userService.checkAvailability(query.username);
  }

  @ApiBearerAuth('BearerAuth')
  @Patch('user/username')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set or change username', operationId: 'setUsername' })
  @ApiResponse({ status: HttpStatus.OK, type: User })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: UnauthorizedResponseDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, type: InternalServerErrorResponseDto })
  setUsername(@Body() dto: SetUsernameDto, @CurrentUser() user: AuthUser): Promise<User> {
    return this.userService.setUsername(user.address, dto.username);
  }

  @ApiBearerAuth('BearerAuth')
  @Patch('user/display-name')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set or clear display name', operationId: 'setDisplayName' })
  @ApiResponse({ status: HttpStatus.OK, type: User })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, type: ErrorResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: UnauthorizedResponseDto })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, type: TooManyRequestsResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, type: InternalServerErrorResponseDto })
  setDisplayName(@Body() dto: SetDisplayNameDto, @CurrentUser() user: AuthUser): Promise<User> {
    return this.userService.setDisplayName(user.address, dto.displayName);
  }

  @Get('profiles/:identifier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get public profile', operationId: 'getPublicProfile' })
  @ApiParam({ name: 'identifier', description: 'Wallet address or username', example: 'alice_dev' })
  @ApiResponse({ status: HttpStatus.OK, type: PublicProfileResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorResponseDto })
  getPublicProfile(@Param('identifier') identifier: string): Promise<PublicProfileResponseDto> {
    return this.userService.getPublicProfile(identifier);
  }
}
