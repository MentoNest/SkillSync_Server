import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { UserService } from '../services/user.service';

// Issue #1166: GET /profiles/:userId - public, unauthenticated, safe fields only.
// No @UseGuards here on purpose: this route must be reachable without a token.
@Controller('profiles')
export class PublicProfileController {
  constructor(private readonly userService: UserService) {}

  @Get(':userId')
  async getPublicProfile(@Param('userId') userId: string) {
    try {
      const profile = await this.userService.getMentorProfile(userId);
      return {
        profileType: 'mentor',
        displayName: profile.user?.displayName ?? null,
        avatarUrl: profile.user?.avatarUrl ?? null,
        bio: profile.bio,
        skills: profile.skills,
        hourlyRate: profile.hourlyRate,
        expertiseAreas: profile.expertiseAreas,
        averageRating: profile.averageRating,
        numberOfReviews: profile.numberOfReviews,
        isVerified: profile.isVerified,
      };
    } catch {
      // fall through to mentee lookup
    }

    try {
      const profile = await this.userService.getMenteeProfile(userId);
      return {
        profileType: 'mentee',
        displayName: profile.user?.displayName ?? null,
        avatarUrl: profile.user?.avatarUrl ?? null,
        learningGoals: profile.learningGoals,
        areasOfInterest: profile.areasOfInterest,
        isVerified: false,
      };
    } catch {
      throw new NotFoundException('Profile not found');
    }
  }
}
