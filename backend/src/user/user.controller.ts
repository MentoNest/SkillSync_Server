import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './entities/user.entity';
import { RolesGuard } from '../guards/roles.guard';
import { AllowInactiveStatus } from '../decorators/allow-inactive-status.decorator';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: 'Register or create a new user profile' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User profile created successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'User already exists' })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.userService.create(createUserDto);
  }

  @Get('profile')
  @UseGuards(RolesGuard)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Current user profile returned',
    type: UserResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
  async getProfile(@CurrentUser() user: User): Promise<UserResponseDto> {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to access profile');
    }
    return this.userService.findUserResponseById(user.id);
  }

  @Patch('profile')
  @UseGuards(RolesGuard)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({ summary: 'Update current authenticated user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid payload' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to update profile');
    }
    return this.userService.update(user.id, updateUserDto);
  }

  @Delete('profile')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({ summary: 'Delete current user account / profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile deleted successfully',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
  async deleteProfile(
    @CurrentUser() user: User,
  ): Promise<{ success: boolean; message: string }> {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to delete profile');
    }
    return this.userService.remove(user.id);
  }

  // #1174: DELETE /user/account - soft-deletes the caller's own account
  // (distinct from the legacy hard-delete DELETE /user/profile above).
  @Delete('account')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({ summary: 'Soft-delete the current user account (#1174)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Account soft-deleted' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
  async deleteAccount(@CurrentUser() user: User) {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to delete account');
    }
    return this.userService.softDeleteAccount(user.id);
  }

  // #1174: POST /user/account/restore - reactivates the caller's own
  // soft-deleted account within the grace period. Marked
  // @AllowInactiveStatus() so RolesGuard lets a 'deleted' user reach it.
  @Post('account/restore')
  @UseGuards(RolesGuard)
  @AllowInactiveStatus()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({ summary: 'Restore a soft-deleted account within the grace period (#1174)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Account restored', type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Grace period expired' })
  async restoreAccount(@CurrentUser() user: User): Promise<UserResponseDto> {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to restore account');
    }
    return this.userService.restoreAccount(user.id);
  }

  // #1177: GET /user/username/available?username=foo - public availability
  // check. Declared before the :id route so 'username' isn't captured by it.
  @Get('username/available')
  @ApiOperation({ summary: 'Check whether a username is available (#1177)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Availability result' })
  async checkUsernameAvailable(@Query('username') username?: string) {
    if (!username) {
      throw new BadRequestException('username query parameter is required');
    }
    const available = await this.userService.isUsernameAvailable(username);
    return { username: username.toLowerCase(), available };
  }

  // #1177: PATCH /user/username - change the caller's username (30-day cooldown)
  @Patch('username')
  @UseGuards(RolesGuard)
  @ApiBearerAuth('Bearer Auth')
  @ApiOperation({ summary: 'Change the current username, subject to a 30-day cooldown (#1177)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Username changed', type: UserResponseDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Username already taken' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Cooldown still in effect' })
  async updateUsername(
    @CurrentUser() user: User,
    @Body() updateUsernameDto: UpdateUsernameDto,
  ): Promise<UserResponseDto> {
    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to change username');
    }
    return this.userService.changeUsername(user.id, updateUsernameDto.username);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User profile found',
    type: UserResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'User not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.userService.findUserResponseById(id);
  }

  @Get()
  @ApiOperation({ summary: 'List and query users with pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated user list retrieved',
  })
  async findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }
}
