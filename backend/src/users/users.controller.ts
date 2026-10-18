import { Body, Controller, Delete, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard, JwtPayload } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async getOwnProfile(@CurrentUser() user: JwtPayload): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.getOwnProfile(user.sub));
  }

  @Patch('me')
  async updateOwnProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return UserResponseDto.fromEntity(await this.users.updateOwnProfile(user.sub, dto));
  }

  @Delete('me')
  async deleteOwnProfile(@CurrentUser() user: JwtPayload): Promise<{ success: boolean; id: string }> {
    await this.users.deleteOwnProfile(user.sub);
    return { success: true, id: user.sub };
  }

  @Get()
  async searchUsers(@Query() query: UserQueryDto) {
    const { items, total, page, limit } = await this.users.searchUsers(query);
    return {
      items: items.map((entry) => UserResponseDto.fromEntity(entry)),
      total,
      page,
      limit,
    };
  }
}
