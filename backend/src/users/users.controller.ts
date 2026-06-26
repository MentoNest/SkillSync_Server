import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { UpdateDisplayNameDto } from './dto/update-display-name.dto';
import { Request } from 'express';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('user/username/available')
  async checkUsernameAvailability(@Query('username') username: string) {
    return this.usersService.checkUsernameAvailability(username);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('user/username')
  async updateUsername(
    @Req() req: Request & { user: { sub: string; ipAddress?: string; userAgent?: string } },
    @Body() dto: UpdateUsernameDto,
  ) {
    return this.usersService.updateUsername(req.user.sub, dto.username, {
      ipAddress: req.ip ?? '',
      userAgent: req.headers['user-agent'] ?? '',
      deviceFingerprint: null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch('user/display-name')
  async updateDisplayName(
    @Req() req: Request & { user: { sub: string } },
    @Body() dto: UpdateDisplayNameDto,
  ) {
    return this.usersService.updateDisplayName(req.user.sub, dto.displayName);
  }

  @Get('profiles/:username')
  async getProfileByUsername(@Param('username') username: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      isVerified: user.isVerified,
      isFeatured: user.isFeatured,
      createdAt: user.createdAt,
    };
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get full user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned' })
  async getProfile(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
