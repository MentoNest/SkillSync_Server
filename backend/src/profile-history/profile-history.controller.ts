import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ErrorResponseDto,
  ForbiddenResponseDto,
  InternalServerErrorResponseDto,
  UnauthorizedResponseDto,
} from '../common/dto/error-response.dto';
import { ProfileHistoryQueryDto } from './dto/profile-history-query.dto';
import {
  ProfileHistoryEntryDto,
  ProfileHistoryPageDto,
} from './dto/profile-history-response.dto';
import { ProfileHistoryService } from './profile-history.service';

@ApiTags('Admin')
@ApiBearerAuth('Bearer Auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class ProfileHistoryController {
  constructor(private readonly historyService: ProfileHistoryService) {}

  @ApiOperation({
    summary: 'Get profile change history for a user',
    description:
      'Returns a paginated, reverse-chronological list of every tracked field change ' +
      'made to the specified user\'s profile. Sensitive field values are redacted. ' +
      'Requires ADMIN role.',
    operationId: 'getProfileHistory',
  })
  @ApiParam({
    name: 'userId',
    description: 'Stellar wallet address of the user.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated history entries.',
    type: ProfileHistoryPageDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No history found for this user.',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid access token.', type: UnauthorizedResponseDto })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Caller does not hold the ADMIN role.', type: ForbiddenResponseDto })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Unexpected server error.', type: InternalServerErrorResponseDto })
  @Get('users/:userId/profile-history')
  @HttpCode(HttpStatus.OK)
  async getProfileHistory(
    @Param('userId') userId: string,
    @Query() query: ProfileHistoryQueryDto,
  ): Promise<ProfileHistoryPageDto> {
    const { entries, total } = await this.historyService.getHistoryForUser(userId, {
      limit: query.limit,
      offset: query.offset,
    });

    return {
      entries: entries.map(ProfileHistoryEntryDto.fromEntity),
      total,
      offset: query.offset ?? 0,
      limit: query.limit ?? 50,
    };
  }
}
