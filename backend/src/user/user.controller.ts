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
import { UserQueryDto } from './dto/user-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './entities/user.entity';
import { RolesGuard } from '../guards/roles.guard';

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
