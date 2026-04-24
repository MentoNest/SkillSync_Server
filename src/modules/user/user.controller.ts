import { Controller, Get, Patch, Delete, Body, UseGuards, HttpCode, HttpStatus, Param, ParseUUIDPipe, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
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
      if (!user.mentorProfile) {
        throw new NotFoundException('Mentor profile not found');
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
    return {
      id: profile.id,
      ...(profile as any),
      userId: user.id,
    };
  }
}
