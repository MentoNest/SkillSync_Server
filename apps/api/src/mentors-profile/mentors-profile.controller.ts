// src/mentors-profile/mentors-profile.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MentorsService } from './mentors-profile.service';
import { MentorProfileResponseDto } from './dto/mentor-profile-response';
import { CreateMentorProfileDto } from './dto/create-mentors-profile.dto';
import { UpdateMentorProfileDto } from './dto/update-mentors-profile.dto';
import { QueryMentorProfileDto } from './dto/query-mentors-profile.dto';
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
    const userId = req.user?.id || 'test-user-id';
    return this.mentorsService.createProfile(userId, dto);
  }

  @Get()
  @ApiOperation({ 
    summary: 'List all approved mentor profiles with filters',
    description: 'Public endpoint to list approved mentors. Supports filtering by expertise and price range.'
  })
  @ApiResponse({
    status: 200,
    description: 'List of approved mentor profiles',
  })
  async findAll(@Query() queryDto: QueryMentorProfileDto) {
    return this.mentorsService.findAll(queryDto);
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

  @Get(':id')
  @ApiOperation({ summary: 'Get mentor profile by ID' })
  @ApiParam({ name: 'id', description: 'Mentor profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async findOne(@Param('id') id: string): Promise<MentorProfileResponseDto> {
    return this.mentorsService.findOne(id);
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

  @Patch(':id')
  @ApiOperation({ 
    summary: 'Update mentor profile by ID',
    description: 'Mentors can only update their own profile and only in draft status'
  })
  @ApiParam({ name: 'id', description: 'Mentor profile ID' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: MentorProfileResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - not your profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateProfileById(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateMentorProfileDto,
  ): Promise<MentorProfileResponseDto> {
    const userId = req.user?.id || 'test-user-id';
    return this.mentorsService.updateProfileById(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Soft delete mentor profile',
    description: 'Mentors can only delete their own profile'
  })
  @ApiParam({ name: 'id', description: 'Mentor profile ID' })
  @ApiResponse({ status: 204, description: 'Profile deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your profile' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async remove(@Param('id') id: string, @Request() req: any): Promise<void> {
    const userId = req.user?.id || 'test-user-id';
    await this.mentorsService.remove(id, userId);
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