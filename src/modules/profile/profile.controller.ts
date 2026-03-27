import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserService } from '../user/providers/user.service';
import { MentorProfileService } from './providers/mentor-profile.service';
import { MenteeProfileService } from './providers/mentee-profile.service';
import { PublicProfileDto } from './dto/public-profile.dto';
import { UserRole } from '../../common/enums/user-role.enum';

@ApiTags('Public Profiles')
@Controller('profiles')
export class ProfileController {
  constructor(
    private readonly userService: UserService,
    private readonly mentorProfileService: MentorProfileService,
    private readonly menteeProfileService: MenteeProfileService,
  ) {}

  @Get(':username')
  @ApiOperation({ summary: 'Get public profile by username' })
  @ApiResponse({ status: 200, description: 'Public profile found', type: PublicProfileDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getPublicProfile(@Param('username') username: string): Promise<PublicProfileDto> {
    const user = await this.userService.findByUsername(username);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Build public profile DTO with only non-sensitive data
    const publicProfile: PublicProfileDto = {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt,
    };

    // Fetch and merge profile data based on role
    if (user.role === UserRole.MENTOR) {
      const mentorProfile = await this.mentorProfileService.findByUserIdOptional(user.id);
      if (mentorProfile) {
        Object.assign(publicProfile, {
          bio: mentorProfile.bio,
          skills: mentorProfile.mentorSkills || [],
          experienceYears: mentorProfile.experienceYears,
          title: mentorProfile.title,
          company: mentorProfile.company,
          linkedinUrl: mentorProfile.linkedinUrl,
          portfolioUrl: mentorProfile.portfolioUrl,
          portfolioLinks: mentorProfile.portfolioLinks,
          hourlyRate: mentorProfile.hourlyRate,
          profileImageUrl: mentorProfile.profileImageUrl,
          isVerified: mentorProfile.isVerified,
          timezone: mentorProfile.timezone,
        });
      }
    } else if (user.role === UserRole.MENTEE) {
      const menteeProfile = await this.menteeProfileService.findByUserIdOptional(user.id);
      if (menteeProfile) {
        Object.assign(publicProfile, {
          bio: menteeProfile.bio,
          interests: menteeProfile.interests,
          primaryGoal: menteeProfile.primaryGoal,
          goals: menteeProfile.goals,
          skillLevel: menteeProfile.skillLevel,
          learningStyle: menteeProfile.learningStyle,
          weeklyAvailability: menteeProfile.weeklyAvailability,
          portfolioLinks: menteeProfile.portfolioLinks,
          profileImageUrl: menteeProfile.profileImageUrl,
          isSeekingMentor: menteeProfile.isSeekingMentor,
          timezone: menteeProfile.timezone,
        });
      }
    }

    return publicProfile;
  }
}
