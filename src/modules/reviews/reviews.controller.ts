import { Controller } from '@nestjs/common';
import { ReviewsService } from './providers/reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}
}
