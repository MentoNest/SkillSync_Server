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
import { MentorProfileService } from './providers/mentor-profile.service';
import { CreateMentorProfileDto } from './dto/create-mentor-profile.dto';
import { UpdateMentorProfileDto } from './dto/update-mentor-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('mentor-profiles')
@ApiBearerAuth()
@Controller('mentor-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MentorProfileController {
  constructor(private readonly mentorProfileService: MentorProfileService) {}

  @Post()
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Create a mentor profile' })
  @ApiResponse({ status: 201, description: 'Mentor profile created successfully' })
  @ApiResponse({ status: 409, description: 'Mentor profile already exists' })
  async create(@Body() createMentorProfileDto: CreateMentorProfileDto, @Request() req) {
    return this.mentorProfileService.create(createMentorProfileDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all available mentor profiles' })
  @ApiResponse({ status: 200, description: 'List of mentor profiles' })
  async findAll() {
    return this.mentorProfileService.findAll();
  }

  @Get('my-profile')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Get current user mentor profile' })
  @ApiResponse({ status: 200, description: 'Mentor profile found' })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  async findMyProfile(@Request() req) {
    return this.mentorProfileService.findByUserId(req.user.id);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search mentor profiles by skills' })
  @ApiResponse({ status: 200, description: 'List of matching mentor profiles' })
  async findBySkills(@Query('skills') skills: string) {
    const skillsArray = skills ? skills.split(',').map(s => s.trim()) : [];
    return this.mentorProfileService.findBySkills(skillsArray);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get mentor profile by ID' })
  @ApiResponse({ status: 200, description: 'Mentor profile found' })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  async findOne(@Param('id') id: string) {
    return this.mentorProfileService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Update mentor profile' })
  @ApiResponse({ status: 200, description: 'Mentor profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  async update(
    @Param('id') id: string,
    @Body() updateMentorProfileDto: UpdateMentorProfileDto,
    @Request() req,
  ) {
    // Verify user owns this profile
    const profile = await this.mentorProfileService.findOne(id);
    if (profile.user.id !== req.user.id) {
      throw new Error('Unauthorized to update this profile');
    }
    return this.mentorProfileService.update(id, updateMentorProfileDto);
  }

  @Delete(':id')
  @Roles(UserRole.MENTOR)
  @ApiOperation({ summary: 'Delete mentor profile' })
  @ApiResponse({ status: 200, description: 'Mentor profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Mentor profile not found' })
  async remove(@Param('id') id: string, @Request() req) {
    // Verify user owns this profile
    const profile = await this.mentorProfileService.findOne(id);
    if (profile.user.id !== req.user.id) {
      throw new Error('Unauthorized to delete this profile');
    }
    return this.mentorProfileService.remove(id);
  }
}
