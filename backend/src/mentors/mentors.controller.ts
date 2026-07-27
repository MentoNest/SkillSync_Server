import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MentorsService } from './mentors.service.js';
import { FeatureMentorDto } from './dto/mentor-feature.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

/**
 * #1005: Featured mentor endpoints.
 *
 * Public:
 *   GET /mentors/featured                     — paginated list of active featured mentors
 *
 * Admin-only:
 *   POST   /admin/mentors/:mentorId/feature    — feature a mentor
 *   DELETE /admin/mentors/:mentorId/unfeature  — unfeature a mentor
 */
@Controller()
export class MentorsController {
  constructor(private readonly mentorsService: MentorsService) {}

  @Get('mentors/featured')
  getFeaturedMentors(@Query() query: PaginationQueryDto) {
    return this.mentorsService.getFeaturedMentors(query.page, query.limit);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @Post('admin/mentors/:mentorId/feature')
  featureMentor(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Request() req: { user: { sub: string } },
    @Body() dto: FeatureMentorDto,
  ) {
    return this.mentorsService.featureMentor(mentorId, req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AuthRole.ADMIN)
  @Delete('admin/mentors/:mentorId/unfeature')
  unfeatureMentor(
    @Param('mentorId', ParseUUIDPipe) mentorId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.mentorsService.unfeatureMentor(mentorId, req.user.sub);
  }
}
