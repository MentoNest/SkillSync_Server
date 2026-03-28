import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ListingOwnershipGuard } from './listing-ownership.guard';

describe('ListingOwnershipGuard', () => {
  let guard: ListingOwnershipGuard;
  let serviceListingService: any;

  beforeEach(() => {
    serviceListingService = {
      getById: jest.fn(),
    };

    guard = new ListingOwnershipGuard(serviceListingService);
  });

  function buildContext(user: any, listingId: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ params: { id: listingId }, user }),
      }),
    } as any;
  }

  it('permits owner access', async () => {
    serviceListingService.getById.mockResolvedValue({ id: 'listing-1', mentorId: 'mentor-123' });

    const result = await guard.canActivate(buildContext({ id: 'mentor-123' }, 'listing-1'));

    expect(result).toBe(true);
    expect(serviceListingService.getById).toHaveBeenCalledWith('listing-1');
  });

  it('throws ForbiddenException if user is not owner', async () => {
    serviceListingService.getById.mockResolvedValue({ id: 'listing-1', mentorId: 'mentor-999' });

    await expect(guard.canActivate(buildContext({ id: 'mentor-123' }, 'listing-1'))).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when listing does not exist', async () => {
    serviceListingService.getById.mockRejectedValue(new NotFoundException('Service listing not found'));

    await expect(guard.canActivate(buildContext({ id: 'mentor-123' }, 'listing-1'))).rejects.toThrow(NotFoundException);
  });

  it('throws UnauthorizedException when user is missing', async () => {
    await expect(guard.canActivate(buildContext(undefined, 'listing-1'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when listing id is missing', async () => {
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ params: {}, user: { id: 'mentor-123' } })}) } as any)).rejects.toThrow(ForbiddenException);
  });
});
