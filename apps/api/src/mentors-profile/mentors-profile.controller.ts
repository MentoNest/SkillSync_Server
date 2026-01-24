// src/mentors/mentors.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { MentorsService } from './mentors-profile.service';
import { MentorProfileResponseDto } from './dto/mentor-profile-response';
import { CreateMentorProfileDto } from './dto/create-mentors-profile.dto';
import { UpdateMentorProfileDto } from './dto/update-mentors-profile.dto';
// Assuming you have a JwtAuthGuard
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Mentors')
@Controller('mentors')
// @UseGuards(JwtAuthGuard) // Uncomment when auth is set up
@ApiBearerAuth()
export class MentorsController {
  constructor(private readonly mentorsService: MentorsService) {}

  @Post('me/profile')
  @ApiOperation({ summary: 'Create mentor profile (draft)' })
  @ApiResponse({
    status: 201,
    description: 'Profile created successfully',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Profile already exists or validation error',
  })
  async createProfile(
    @Request() req: any,
    @Body() dto: CreateMentorProfileDto,
  ): Promise<MentorProfileResponseDto> {
    const userId = req.user?.id || 'test-user-id'; // Replace with actual user from JWT
    return this.mentorsService.createProfile(userId, dto);
  }

  @Get('me/profile')
  @ApiOperation({ summary: 'Get my mentor profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(@Request() req: any): Promise<MentorProfileResponseDto> {
    const userId = req.user?.id || 'test-user-id';
    return this.mentorsService.getProfileByUserId(userId);
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Update my mentor profile (only in draft status)' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot update profile in current status',
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateProfile(
    @Request() req: any,
    @Body() dto: UpdateMentorProfileDto,
  ): Promise<MentorProfileResponseDto> {
    const userId = req.user?.id || 'test-user-id';
    return this.mentorsService.updateProfile(userId, dto);
  }

  @Post('me/profile/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit mentor profile for review (draft → submitted)',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile submitted for review',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async submitProfile(@Request() req: any): Promise<MentorProfileResponseDto> {
    const userId = req.user?.id || 'test-user-id';
    return this.mentorsService.submitProfile(userId);
  }
}
