import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { Public } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { RoleName } from '../rbac/roles';
import { RequestVerificationDto, VerifyMentorDto } from './dto/mentor-verification.dto';
import { MentorVerificationService } from './mentor-verification.service';

@ApiTags('Mentor Verification')
@ApiBearerAuth()
@Controller('admin/mentors')
@UseGuards(RolesGuard)
@Roles(RoleName.ADMIN)
export class AdminMentorVerificationController {
  constructor(private readonly verification: MentorVerificationService) {}

  @Post(':mentorId/verify')
  verify(
    @Param('mentorId') mentorId: string,
    @CurrentUser('sub') adminId: string,
    @Body() dto: VerifyMentorDto,
  ) {
    return this.verification.verify(mentorId, adminId, dto);
  }

  @Post(':mentorId/verify/revoke')
  revoke(@Param('mentorId') mentorId: string, @CurrentUser('sub') adminId: string) {
    return this.verification.revoke(mentorId, adminId);
  }

  @Get('pending')
  pending() {
    return this.verification.pending();
  }
}

@ApiTags('Mentor Verification')
@Controller('mentors')
export class MentorVerificationController {
  constructor(private readonly verification: MentorVerificationService) {}

  @ApiBearerAuth()
  @Post('me/verification-request')
  requestVerification(@CurrentUser('sub') userId: string, @Body() dto: RequestVerificationDto) {
    return this.verification.requestVerification(userId, dto);
  }

  @Public()
  @Get(':mentorId/verification')
  status(@Param('mentorId') mentorId: string) {
    return this.verification.status(mentorId);
  }
}
