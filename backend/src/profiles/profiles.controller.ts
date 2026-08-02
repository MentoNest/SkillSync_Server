import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ProfilesService } from './profiles.service.js';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto.js';

@Controller('profiles')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 100, ttl: 60000 } })
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':userId')
  async getPublicProfile(
    @Param('userId') userId: string,
  ): Promise<PublicProfileResponseDto> {
    return this.profilesService.getPublicProfile(userId);
  }
}
