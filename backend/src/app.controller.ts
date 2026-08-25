import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { Roles } from './decorators/roles.decorator';
import { RolesGuard } from './guards/roles.guard';

interface SetPlatformFeeDto {
  new_fee_bps: number;
}

@Controller('platform')
@UseGuards(RolesGuard)
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Get current platform fee (any authenticated user can access)
  @Get('fee')
  getPlatformFee(): { platform_fee_bps: number } {
    const fee = this.appService.getPlatformFee();
    return { platform_fee_bps: fee };
  }

  // Update platform fee (admin only)
  @Post('fee')
  @Roles('admin') // Only users with admin role can access this endpoint
  setPlatformFee(
    @Body() setPlatformFeeDto: SetPlatformFeeDto,
  ) {
    // We no longer need to check the x-admin-wallet header because RolesGuard
    // already verifies that the authenticated user has the admin role
    return this.appService.setPlatformFee(setPlatformFeeDto.new_fee_bps);
  }
}