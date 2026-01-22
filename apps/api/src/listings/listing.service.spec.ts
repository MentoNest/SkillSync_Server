import { Test, TestingModule } from '@nestjs/testing';
import { ListingsService } from './listings.service';

describe('ListingService  ', () => {
  let service: ListingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ListingsService],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
