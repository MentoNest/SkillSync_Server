import { Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/guards/current-user.decorator';
import { UserAccountService } from './user-account.service';

@Controller('user/account')
export class UserAccountController {
  constructor(private readonly accounts: UserAccountService) {}

  @Delete()
  @HttpCode(200)
  softDelete(@CurrentUser('sub') userId: string) {
    return this.accounts.softDelete(userId);
  }

  @Post('restore')
  @HttpCode(200)
  restore(@CurrentUser('sub') userId: string) {
    return this.accounts.restore(userId);
  }
}
