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
import { AuthUser, Role } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import { FeaturedMentorService } from './featured-mentor.service';
import {
  FeaturedMentorDto,
  FeaturedMentorsPageDto,
  FeatureMentorDto,
  QueryFeaturedMentorsDto,
} from './dto/featured-mentor.dto';

@ApiTags('Admin')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/mentors')
export class FeaturedMentorAdminController {
  constructor(private readonly featured: FeaturedMentorService) {}

  @ApiOperation({
    summary: 'Feature a mentor',
    description:
      'Adds a mentor to the curated featured list. Enforces the configured maximum ' +
      'and optional manual ordering. Requires ADMIN role.',
    operationId: 'featureMentor',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor profile UUID' })
  @ApiResponse({ status: HttpStatus.OK, type: FeaturedMentorDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, type: UnauthorizedResponseDto })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, type: ErrorResponseDto })
  @Post(':mentorId/feature')
  @HttpCode(HttpStatus.OK)
  feature(
    @Param('mentorId') mentorId: string,
    @Body() dto: FeatureMentorDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.featured.featureMentor(mentorId, admin.address, dto.featuredOrder);
  }

  @ApiOperation({
    summary: 'Unfeature a mentor',
    description: 'Removes a mentor from the featured list. Requires ADMIN role.',
    operationId: 'unfeatureMentor',
  })
  @ApiParam({ name: 'mentorId', description: 'Mentor profile UUID' })
  @ApiResponse({ status: HttpStatus.OK })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, type: ForbiddenResponseDto })
  @Delete(':mentorId/unfeature')
  unfeature(
    @Param('mentorId') mentorId: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.featured.unfeatureMentor(mentorId, admin.address);
  }
}

@ApiTags('Profiles')
@Controller('mentors')
export class FeaturedMentorPublicController {
  constructor(private readonly featured: FeaturedMentorService) {}

  @ApiOperation({
    summary: 'List featured mentors',
    description:
      'Public, paginated list of currently featured mentors, sorted by manual ' +
      'featured order. Expired features are removed automatically.',
    operationId: 'listFeaturedMentors',
  })
  @ApiResponse({ status: HttpStatus.OK, type: FeaturedMentorsPageDto })
  @Get('featured')
  list(@Query() query: QueryFeaturedMentorsDto): Promise<FeaturedMentorsPageDto> {
    return this.featured.getFeaturedMentors({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }
}
