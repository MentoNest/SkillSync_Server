import { Controller, Get, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { PublicProfilesService } from './profiles.service';
import { PublicProfileResponse } from './dto/public-profile-response.dto';
import { RedisThrottlerGuard } from '../auth/guards/redis-throttler.guard';
import { Throttle } from '../auth/decorators/throttle.decorator';

/**
 * Public Profiles Controller
 * Exposes public profile data endpoints without authentication
 * Implements rate limiting: 100 requests per minute per IP
 */
@Controller('profiles')
@UseGuards(RedisThrottlerGuard)
@Throttle(100, 60) // 100 requests per minute per IP
export class PublicProfilesController {
  constructor(private readonly publicProfilesService: PublicProfilesService) {}

  /**
   * GET /profiles/:userId
   * Retrieve public profile for a user
   * Returns mentor or mentee profile based on which exists
   * Cached for 5 minutes
   *
   * @param userId - User ID (UUID)
   * @returns PublicProfileResponse - Mentor or Mentee profile data
   * @throws NotFoundException - If user or profile doesn't exist
   */
  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  async getPublicProfile(@Param('userId') userId: string): Promise<PublicProfileResponse> {
    return this.publicProfilesService.getPublicProfile(userId);
  }
}
