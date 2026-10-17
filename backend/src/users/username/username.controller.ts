import { Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { Public } from '../../auth/guards/jwt-auth.guard';
import { ChangeUsernameDto } from './dto/change-username.dto';
import { UsernameService } from './username.service';

export interface PublicProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

@ApiTags('User')
@Controller()
export class UsernameController {
  constructor(private readonly usernames: UsernameService) {}

  @Public()
  @Get('user/username/available')
  async available(@Query('username') username: string): Promise<{ username: string; available: boolean }> {
    return { username, available: await this.usernames.isAvailable(username) };
  }

  @ApiBearerAuth()
  @Patch('user/username')
  @HttpCode(200)
  change(@CurrentUser('sub') userId: string, @Body() dto: ChangeUsernameDto) {
    return this.usernames.changeUsername(userId, dto.username);
  }

  @Public()
  @Get('profiles/:username')
  async profile(@Param('username') username: string): Promise<PublicProfile> {
    const user = await this.usernames.resolveProfile(username);
    if (!user) throw new NotFoundException('Profile not found');
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }
}
