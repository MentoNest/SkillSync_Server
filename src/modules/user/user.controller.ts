import { Controller, Get, Patch, Delete, Post, Body, UseGuards, HttpCode, HttpStatus, Param, ParseUUIDPipe, NotFoundException, ForbiddenException, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateMentorProfileDto } from './dto/update-mentor-profile.dto';
import { UpdateMenteeProfileDto } from './dto/update-mentee-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { MentorProfile } from './entities/mentor-profile.entity';
import { MenteeProfile } from './entities/mentee-profile.entity';
import { AuditLog } from '../auth/entities/audit-log.entity';
import { AuditEventType } from '../auth/entities/audit-log.entity';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MentorProfile)
    private readonly mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeProfileRepository: Repository<MenteeProfile>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@CurrentUser() user: any): Promise<UserResponseDto> {
    return this.userService.findById(user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.userService.update(user.userId, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own account (soft delete)' })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  deleteMe(@CurrentUser() user: any): Promise<void> {
    return this.userService.remove(user.userId);
  }

  @Get('deleted')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List soft-deleted users (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of soft-deleted users' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  async getDeletedUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.userService.findDeletedUsers(page, limit);
  }

  @Post(':id/restore')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Restore a soft-deleted user (Admin only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin only' })
  @ApiResponse({ status: 404, description: 'Soft-deleted user not found' })
  async restoreUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() adminUser: any,
  ): Promise<UserResponseDto> {
    return this.userService.restoreUser(id, adminUser.userId);
  }

  @Patch('profile/:type')
  @ApiOperation({ summary: 'Update mentor or mentee profile' })
  @ApiParam({ name: 'type', enum: ['mentor', 'mentee'] })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateProfile(
    @CurrentUser() currentUser: any,
    @Param('type') type: 'mentor' | 'mentee',
    @Body() dto: UpdateMentorProfileDto | UpdateMenteeProfileDto,
  ): Promise<any> {
    // Find the user
    const user = await this.userRepository.findOne({
      where: { id: currentUser.userId },
      relations: ['mentorProfile', 'menteeProfile'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check permissions: user can update own profile, or admin can update any profile
    const isOwner = user.id === currentUser.userId;
    const isAdmin = user.roles.some(role => role.name === UserRole.ADMIN);
    
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have permission to update this profile');
    }

    let profile: MentorProfile | MenteeProfile | null = null;
    let oldValues: any = {};

    // Handle mentor profile updates
    if (type === 'mentor') {
      // Only users with mentor role or admins can update mentor profiles
      const hasMentorRole = user.roles && user.roles.some((r) => r.name === UserRole.MENTOR);
      const isAdminRole = user.roles && user.roles.some((r) => r.name === UserRole.ADMIN);
      if (!hasMentorRole && !isAdminRole) {
        throw new ForbiddenException('Only mentors can update mentor profiles');
      }

      if (!user.mentorProfile) {
        // create a new mentor profile for the user
        const newProfile = this.mentorProfileRepository.create({ user: user as any });
        user.mentorProfile = await this.mentorProfileRepository.save(newProfile);
      }
      
      // Store old values for audit
      oldValues = {
        bio: user.mentorProfile.bio,
        yearsOfExperience: user.mentorProfile.yearsOfExperience,
        expertise: user.mentorProfile.expertise,
        preferredMentoringStyle: user.mentorProfile.preferredMentoringStyle,
        availabilityHoursPerWeek: user.mentorProfile.availabilityHoursPerWeek,
        availabilityDetails: user.mentorProfile.availabilityDetails,
      };
      
      profile = user.mentorProfile;
      Object.assign(profile, dto);

      // Server-side guards: enforce skills max 20 and hourlyRate bounds
      if (Array.isArray(profile.skills) && profile.skills.length > 20) {
        throw new ForbiddenException('Maximum 20 skills allowed');
      }
      if (profile.hourlyRate !== undefined && profile.hourlyRate !== null) {
        const rate = Number(profile.hourlyRate);
        if (isNaN(rate) || rate < 0 || rate > 1000) {
          throw new ForbiddenException('hourlyRate must be between 0 and 1000');
        }
      }

      await this.mentorProfileRepository.save(profile);
    } 
    // Handle mentee profile updates
    else if (type === 'mentee') {
      if (!user.menteeProfile) {
        throw new NotFoundException('Mentee profile not found');
      }
      
      // Store old values for audit
      oldValues = {
        learningGoals: user.menteeProfile.learningGoals,
        areasOfInterest: user.menteeProfile.areasOfInterest,
        currentSkillLevel: user.menteeProfile.currentSkillLevel,
        preferredMentoringStyle: user.menteeProfile.preferredMentoringStyle,
        timeCommitmentHoursPerWeek: user.menteeProfile.timeCommitmentHoursPerWeek,
        professionalBackground: user.menteeProfile.professionalBackground,
        jobTitle: user.menteeProfile.jobTitle,
        industry: user.menteeProfile.industry,
        portfolioLinks: user.menteeProfile.portfolioLinks,
      };
      
      profile = user.menteeProfile;
      Object.assign(profile, dto);
      await this.menteeProfileRepository.save(profile);
    }

    // Create audit log entry
    const auditLog = this.auditLogRepository.create({
      userId: user.id,
      walletAddress: user.walletAddress,
      eventType: AuditEventType.PROFILE_UPDATED,
      ipAddress: '0.0.0.0', // In a real app, extract from request
      metadata: {
        profileType: type,
        oldValues,
        newValues: dto,
        updatedBy: isAdmin && !isOwner ? currentUser.userId : null,
      },
    });
    
    await this.auditLogRepository.save(auditLog);

    // Return updated profile
    const p = profile as any;

    // Compute simple profile completion percentage based on required fields
    const requiredFields = [
      'bio',
      'skills',
      'hourlyRate',
      'yearsOfExperience',
      'currentRole',
      'education',
      'languages',
    ];
    let filled = 0;
    for (const f of requiredFields) {
      if (p[f] !== undefined && p[f] !== null && (Array.isArray(p[f]) ? p[f].length > 0 : String(p[f]).trim() !== '')) {
        filled += 1;
      }
    }
    const completion = Math.round((filled / requiredFields.length) * 100);

    return {
      id: profile.id,
      ...p,
      userId: user.id,
      profileCompletion: completion,
    };
  }

  @Get('me/mentor')
  @ApiOperation({ summary: 'Get own mentor profile' })
  @ApiResponse({ status: 200, description: 'Mentor profile' })
  async getMyMentorProfile(@CurrentUser() currentUser: any) {
    const user = await this.userRepository.findOne({ where: { id: currentUser.userId }, relations: ['mentorProfile', 'roles'] });
    if (!user) throw new NotFoundException('User not found');
    if (!user.mentorProfile) return null;

    const p: any = user.mentorProfile;
    const requiredFields = ['bio','skills','hourlyRate','yearsOfExperience','currentRole','education','languages'];
    let filled = 0;
    for (const f of requiredFields) {
      if (p[f] !== undefined && p[f] !== null && (Array.isArray(p[f]) ? p[f].length > 0 : String(p[f]).trim() !== '')) filled += 1;
    }
    const completion = Math.round((filled / requiredFields.length) * 100);
    return { id: p.id, ...p, userId: user.id, profileCompletion: completion };
  }

  @Get(':id/mentor')
  @ApiOperation({ summary: 'Get mentor profile by user id' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Mentor profile' })
  async getMentorProfileByUserId(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.userRepository.findOne({ where: { id }, relations: ['mentorProfile'] });
    if (!user) throw new NotFoundException('User not found');
    if (!user.mentorProfile) return null;
    const p: any = user.mentorProfile;
    const requiredFields = ['bio','skills','hourlyRate','yearsOfExperience','currentRole','education','languages'];
    let filled = 0;
    for (const f of requiredFields) {
      if (p[f] !== undefined && p[f] !== null && (Array.isArray(p[f]) ? p[f].length > 0 : String(p[f]).trim() !== '')) filled += 1;
    }
    const completion = Math.round((filled / requiredFields.length) * 100);
    return { id: p.id, ...p, userId: user.id, profileCompletion: completion };
  }

  @Delete('me/mentor')
  @ApiOperation({ summary: 'Delete own mentor profile' })
  @ApiResponse({ status: 204, description: 'Mentor profile deleted' })
  async deleteMyMentorProfile(@CurrentUser() currentUser: any) {
    const user = await this.userRepository.findOne({ where: { id: currentUser.userId }, relations: ['mentorProfile', 'roles'] });
    if (!user) throw new NotFoundException('User not found');

    const hasMentorRole = user.roles && user.roles.some((r) => r.name === UserRole.MENTOR);
    const isAdminRole = user.roles && user.roles.some((r) => r.name === UserRole.ADMIN);
    if (!hasMentorRole && !isAdminRole) {
      throw new ForbiddenException('Only mentors can delete their mentor profile');
    }

    if (!user.mentorProfile) {
      return null;
    }

    await this.mentorProfileRepository.delete(user.mentorProfile.id);
    return null;
  }
}
