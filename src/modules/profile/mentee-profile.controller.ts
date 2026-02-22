import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MenteeProfileService } from './providers/mentee-profile.service';
import { CreateMenteeProfileDto } from './dto/create-mentee-profile.dto';
import { UpdateMenteeProfileDto } from './dto/update-mentee-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('mentee-profiles')
@ApiBearerAuth()
@Controller('mentee-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenteeProfileController {
  constructor(private readonly menteeProfileService: MenteeProfileService) {}

  @Post()
  @Roles(UserRole.MENTEE)
  @ApiOperation({ summary: 'Create a mentee profile' })
  @ApiResponse({ status: 201, description: 'Mentee profile created successfully' })
  @ApiResponse({ status: 409, description: 'Mentee profile already exists' })
  async create(@Body() createMenteeProfileDto: CreateMenteeProfileDto, @Request() req) {
    return this.menteeProfileService.create(createMenteeProfileDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all mentee profiles seeking mentorship' })
  @ApiResponse({ status: 200, description: 'List of mentee profiles' })
  async findAll() {
    return this.menteeProfileService.findAll();
  }

  @Get('my-profile')
  @Roles(UserRole.MENTEE)
  @ApiOperation({ summary: 'Get current user mentee profile' })
  @ApiResponse({ status: 200, description: 'Mentee profile found' })
  @ApiResponse({ status: 404, description: 'Mentee profile not found' })
  async findMyProfile(@Request() req) {
    return this.menteeProfileService.findByUserId(req.user.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search mentee profiles by interests' })
  @ApiResponse({ status: 200, description: 'List of matching mentee profiles' })
  async findByInterests(@Query('interests') interests: string) {
    const interestsArray = interests ? interests.split(',').map(i => i.trim()) : [];
    return this.menteeProfileService.findByInterests(interestsArray);
  }

  @Get('by-goal')
  @ApiOperation({ summary: 'Search mentee profiles by goal' })
  @ApiResponse({ status: 200, description: 'List of matching mentee profiles' })
  async findByGoal(@Query('goal') goal: string) {
    return this.menteeProfileService.findByGoal(goal);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get mentee profile by ID' })
  @ApiResponse({ status: 200, description: 'Mentee profile found' })
  @ApiResponse({ status: 404, description: 'Mentee profile not found' })
  async findOne(@Param('id') id: string) {
    return this.menteeProfileService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.MENTEE)
  @ApiOperation({ summary: 'Update mentee profile' })
  @ApiResponse({ status: 200, description: 'Mentee profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Mentee profile not found' })
  async update(
    @Param('id') id: string,
    @Body() updateMenteeProfileDto: UpdateMenteeProfileDto,
    @Request() req,
  ) {
    // Verify user owns this profile
    const profile = await this.menteeProfileService.findOne(id);
    if (profile.user.id !== req.user.id) {
      throw new Error('Unauthorized to update this profile');
    }
    return this.menteeProfileService.update(id, updateMenteeProfileDto);
  }

  @Delete(':id')
  @Roles(UserRole.MENTEE)
  @ApiOperation({ summary: 'Delete mentee profile' })
  @ApiResponse({ status: 200, description: 'Mentee profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Mentee profile not found' })
  async remove(@Param('id') id: string, @Request() req) {
    // Verify user owns this profile
    const profile = await this.menteeProfileService.findOne(id);
    if (profile.user.id !== req.user.id) {
      throw new Error('Unauthorized to delete this profile');
    }
    return this.menteeProfileService.remove(id);
  }
}
