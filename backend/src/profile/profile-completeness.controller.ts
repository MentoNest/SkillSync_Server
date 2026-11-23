import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '../auth/auth.types';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CompletenessAdminPageDto,
  CompletenessAdminQueryDto,
  ProfileCompletenessDto,
} from './dto/profile-completeness.dto';
import { ProfileCompletenessService } from './profile-completeness.service';

@ApiTags('Profiles')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard)
@Controller('user')
export class ProfileCompletenessController {
  constructor(private readonly completeness: ProfileCompletenessService) {}

  @ApiOperation({
    summary: 'Get my profile completeness score',
    description:
      'Returns a dynamically calculated score (0–110), the missing required fields, ' +
      'and improvement suggestions for profiles below 80%. Cached for five minutes.',
    operationId: 'getProfileCompleteness',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ProfileCompletenessDto })
  @Get('profile/completeness')
  @HttpCode(HttpStatus.OK)
  getMine(@CurrentUser() user: AuthUser): Promise<ProfileCompletenessDto> {
    return this.completeness.getForUser(user.address);
  }
}

@ApiTags('Admin')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/users')
export class CompletenessAdminController {
  constructor(private readonly completeness: ProfileCompletenessService) {}

  @ApiOperation({
    summary: 'List completeness scores for all users',
    description: 'Admin-only paginated view of every user’s profile completeness score.',
    operationId: 'listCompletenessScores',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CompletenessAdminPageDto })
  @Get('completeness')
  list(@Query() query: CompletenessAdminQueryDto): Promise<CompletenessAdminPageDto> {
    return this.completeness.getAll({ page: query.page ?? 1, limit: query.limit ?? 20 });
  }
}
