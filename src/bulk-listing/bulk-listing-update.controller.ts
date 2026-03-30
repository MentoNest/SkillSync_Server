import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { BulkListingUpdateService } from './bulk-listing-update.service';
import {
  BulkListingUpdateDto,
  BulkListingUpdateResponseDto,
} from './dto/bulk-listing-update.dto';

/** Minimal interface – swap for your actual auth guard */
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Listings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('listings')
export class BulkListingUpdateController {
  constructor(private readonly bulkUpdateService: BulkListingUpdateService) {}

  /**
   * PATCH /listings/bulk
   *
   * Accepts an array of partial listing patches (up to 100 per call).
   * Returns a per-item success / failure report plus aggregate totals.
   */
  @Patch('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk update listings',
    description:
      'Partially update up to 100 listings in one request. ' +
      'Each item requires at least its `id`; only supplied fields are changed. ' +
      'Returns a per-item result so callers can retry individual failures.',
  })
  @ApiResponse({
    status: 200,
    description: 'Bulk update complete (inspect `failed` count for partial errors)',
    type: BulkListingUpdateResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async bulkUpdate(
    @Body() dto: BulkListingUpdateDto,
    @Req() req: Request & { user: { id: string } },
  ): Promise<BulkListingUpdateResponseDto> {
    return this.bulkUpdateService.bulkUpdate(dto, req.user.id);
  }
}
