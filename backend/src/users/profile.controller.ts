import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { CreateProfileDto } from './dto/create-profile.dto';

@ApiTags('users')
@Controller('user')
export class ProfileController {
  @Post('profile')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create mentor or mentee profile for authenticated user' })
  @ApiBody({ type: CreateProfileDto })
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @ApiResponse({ status: 409, description: 'Profile of this type already exists' })
  async createProfile(@Req() req: any, @Body() dto: CreateProfileDto) {
    return {
      userId: req.user.sub,
      profileType: dto.profileType,
      createdAt: new Date().toISOString(),
      message: 'Profile created successfully',
    };
  }
}
