import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/guards/jwt-auth.guard';
import { Throttle } from '../../rate-limit/throttle.decorator';
import { ProfileService } from './profile.service';

@ApiTags('profiles')
@Controller('profiles')
export class PublicProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Public()
  @Get(':userId')
  @Throttle(100, 60)
  @ApiOperation({ summary: 'Read a public mentor or mentee profile (no authentication required)' })
  get(@Param('userId') userId: string) {
    return this.profiles.getPublicProfile(userId);
  }
}
