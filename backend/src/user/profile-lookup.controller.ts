import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UserStatus } from './entities/user.entity';
import { PublicUserResponseDto } from './dto/public-user-response.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * #1177: Public profile lookup by user ID or username, e.g.
 * GET /profiles/alex_rivers or GET /profiles/123e4567-....
 * Deleted/suspended/pending accounts are hidden (404), matching the rest
 * of the public surface (#1174/#1176).
 */
@ApiTags('Profiles')
@Controller('profiles')
export class ProfileLookupController {
  constructor(private readonly userService: UserService) {}

  @Get(':idOrUsername')
  @ApiOperation({ summary: 'Get a public profile by user ID or username (#1177)' })
  @ApiParam({ name: 'idOrUsername', description: 'User UUID or username' })
  @ApiResponse({ status: 200, description: 'Public profile found', type: PublicUserResponseDto })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getByIdOrUsername(@Param('idOrUsername') idOrUsername: string): Promise<PublicUserResponseDto> {
    const user = UUID_REGEX.test(idOrUsername)
      ? await this.userService.findByIdIfActive(idOrUsername)
      : await this.userService.findByUsername(idOrUsername);

    // #1174/#1176: never surface a deleted/suspended/pending account here.
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Profile not found');
    }

    return PublicUserResponseDto.fromEntity(user);
  }
}
