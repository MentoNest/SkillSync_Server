import { Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { UsersService } from './users.service';
import { Request } from 'express';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Delete('user/account')
  async softDelete(@Req() req: Request & { user: { sub: string } }) {
    await this.usersService.softDeleteUser(req.user.sub);
    return { message: 'Account deleted. You may restore it within the grace period.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('user/account/restore')
  async restore(@Req() req: Request & { user: { sub: string } }) {
    return this.usersService.restoreUser(req.user.sub);
  }
}
