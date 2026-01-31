import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

// import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../decorators/auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviewsService: ReviewsService,
  ) {}

  @Post()
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(userId, dto);
  }
}
