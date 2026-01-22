import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { VerifyService } from './verify.service';
import { UpdateKycDto } from './dto/update-kyc.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/decorators/rbac.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentMentorProfile } from '../decorators/auth/current-mentor-profile.decorator';
import { User } from '../users/entities/user.entity';

@Controller('verify/kyc')
export class VerifyController {
  private readonly logger = new Logger(VerifyController.name);

  constructor(private readonly verifyService: VerifyService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getUserKyc(@CurrentMentorProfile() currentUser: User) {
    this.logger.log(`Fetching KYC status for user ${currentUser.id}`);
    return await this.verifyService.getUserKyc(currentUser.id);
  }

  @Patch(':userId')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @Roles('admin') // Assuming we have an admin role
  @HttpCode(HttpStatus.OK)
  async updateKycByAdmin(
    @Param('userId') userId: string,
    @Body() updateKycDto: UpdateKycDto,
    @CurrentMentorProfile() currentUser: User,
  ) {
    this.logger.log(`Admin ${currentUser.id} updating KYC for user ${userId}`);
    return await this.verifyService.updateKycByAdmin(userId, updateKycDto, currentUser.id);
  }
}