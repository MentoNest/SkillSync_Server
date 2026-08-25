import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { AppService } from './app.service';

interface SetPlatformFeeDto {
  new_fee_bps: number;
}

@Controller('platform')
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Get current platform fee
  @Get('fee')
  getPlatformFee(): { platform_fee_bps: number } {
    const fee = this.appService.getPlatformFee();
    return { platform_fee_bps: fee };
  }

  // Update platform fee (admin only)
  @Post('fee')
  setPlatformFee(
    @Body() setPlatformFeeDto: SetPlatformFeeDto,
    @Headers('x-admin-wallet') adminWallet: string,
  ) {
    return this.appService.setPlatformFee(setPlatformFeeDto.new_fee_bps, adminWallet);
  }
}