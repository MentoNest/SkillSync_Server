import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ServiceListingService } from '../service-listing.service';

@Injectable()
export class ListingOwnershipGuard implements CanActivate {
  constructor(private readonly serviceListingService: ServiceListingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const listingId = request.params?.id;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!listingId) {
      throw new ForbiddenException('Listing ID is required');
    }

    const serviceListing = await this.serviceListingService.getById(listingId);
    if (!serviceListing) {
      throw new NotFoundException('Service listing not found');
    }

    if (serviceListing.mentorId !== user.id) {
      throw new ForbiddenException('You can only perform this action on your own listings');
    }

    return true;
  }
}
