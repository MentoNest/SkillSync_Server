# PR: Bulk listing + ownership guard + review integration

## Summary
- Adds bulk service listing creation endpoint for mentors
- Adds ownership guard middleware for listing modification routes
  (update, visibility, draft, delete, upload-image)
- Adds listing-review ORM relationships and review endpoints
- Adds unit tests for all features

## Files changed
- `src/modules/service-listing/dto/bulk-create-service-listing.dto.ts`
- `src/modules/service-listing/service-listing.controller.ts`
- `src/modules/service-listing/service-listing.service.ts`
- `src/modules/service-listing/service-listing.service.spec.ts`
- `src/modules/service-listing/service-listing.module.ts`
- `src/modules/service-listing/guards/listing-ownership.guard.ts`
- `src/modules/service-listing/guards/listing-ownership.guard.spec.ts`
- `src/modules/service-listing/entities/service-listing.entity.ts`
- `src/modules/reviews/entities/review.entity.ts`

## Closes
- Closes #1 (Bulk Listing Creation)
- Closes #2 (Listing Ownership Verification Middleware)
- Closes #3 (Listing Review Integration)

## Notes
- Bulk route: `POST /service-listings/bulk` accepts `{ listings: CreateServiceListingDto[] }`
- Middleware verifies `req.user.id === listing.mentorId` on protected endpoints
- New endpoint: `GET /service-listings/:id/with-reviews` returns listing with reviews array
- Reviews kept in sync with listing rating/reviewCount via service layer
- Test coverage included for owner guard, bulk creation, and reviews integration
