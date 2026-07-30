import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto.js';
import { UserStatus } from './enums/user-status.enum.js';

/** #1003: Public profile lookup by username. No auth required. */
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username')
  async getByUsername(
    @Param('username') username: string,
  ): Promise<PublicProfileResponseDto> {
    const user = await this.usersService.findByUsername(username);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException('Profile not found');
    }
    return PublicProfileResponseDto.fromEntity(user);
  }
}
