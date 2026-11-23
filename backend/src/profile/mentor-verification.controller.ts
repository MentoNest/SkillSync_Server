import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ForbiddenResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import {
  MentorVerificationRequestsPageDto,
  QueryMentorVerificationRequestsDto,
  VerifyMentorDto,
} from './dto/mentor-verification.dto';
import { MentorVerificationService } from './mentor-verification.service';

@ApiTags('Admin')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/mentors')
export class MentorVerificationAdminController {
  constructor(private readonly verification: MentorVerificationService) {}

  @ApiOperation({
    summary: 'Verify a mentor',
    description:
      'Marks a mentor verified after reviewing email, ID, or credential evidence. Requires ADMIN.',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor profile UUID' })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    type: UnauthorizedResponseDto,
  })
  @Post(':mentorId/verify')
  @HttpCode(HttpStatus.OK)
  verify(
    @Param('mentorId') mentorId: string,
    @Body() dto: VerifyMentorDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.verification.verify(mentorId, admin.address, dto);
  }

  @ApiOperation({
    summary: 'Revoke mentor verification',
    description: 'Requires ADMIN.',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor profile UUID' })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @Delete(':mentorId/verify')
  revoke(@Param('mentorId') mentorId: string, @CurrentUser() admin: AuthUser) {
    return this.verification.revoke(mentorId, admin.address);
  }

  @ApiOperation({
    summary: 'List mentor verification requests',
    description:
      'Returns user-submitted requests awaiting admin review. Requires ADMIN.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: MentorVerificationRequestsPageDto,
  })
  @Get('verification-requests')
  pending(@Query() query: QueryMentorVerificationRequestsDto) {
    return this.verification.getPendingRequests(query);
  }
}

@ApiTags('Profiles')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard)
@Controller('mentors')
export class MentorVerificationRequestController {
  constructor(private readonly verification: MentorVerificationService) {}

  @ApiOperation({
    summary: 'Request mentor verification',
    description:
      'Creates a pending admin review task for the authenticated mentor.',
  })
  @ApiResponse({ status: HttpStatus.CREATED })
  @Post('me/verification-request')
  @HttpCode(HttpStatus.CREATED)
  request(@CurrentUser() user: AuthUser) {
    return this.verification.requestVerification(user.address);
  }
}
