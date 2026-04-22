import { Test, TestingModule } from '@nestjs/testing';
import { BulkListingUpdateController } from './bulk-listing-update.controller';
import { BulkListingUpdateService } from './bulk-listing-update.service';
import { BulkListingUpdateDto, ListingStatus } from './dto/bulk-listing-update.dto';

const OWNER_ID = 'user-uuid-owner';

const mockRequest = () =>
  ({ user: { id: OWNER_ID } } as any);

describe('BulkListingUpdateController', () => {
  let controller: BulkListingUpdateController;
  let service: { bulkUpdate: jest.Mock };

  beforeEach(async () => {
    service = { bulkUpdate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BulkListingUpdateController],
      providers: [{ provide: BulkListingUpdateService, useValue: service }],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard ?? class {})
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(BulkListingUpdateController);
  });

  it('delegates to the service and forwards the user id', async () => {
    const dto: BulkListingUpdateDto = {
      updates: [{ id: 'id-1', status: ListingStatus.ACTIVE }],
    };

    const expected = {
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ id: 'id-1', success: true }],
    };

    service.bulkUpdate.mockResolvedValue(expected);

    const result = await controller.bulkUpdate(dto, mockRequest());

    expect(service.bulkUpdate).toHaveBeenCalledWith(dto, OWNER_ID);
    expect(result).toEqual(expected);
  });

  it('propagates service errors upward', async () => {
    service.bulkUpdate.mockRejectedValue(new Error('DB down'));
    const dto: BulkListingUpdateDto = { updates: [{ id: 'id-1' }] };

    await expect(controller.bulkUpdate(dto, mockRequest())).rejects.toThrow('DB down');
  });
});
