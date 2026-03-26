# Listing Tags Support Implementation

## Overview
Implemented support for adding tags to service listings, allowing mentors to categorize their services with searchable tags for better discoverability.

## Changes Made

### 1. Database Schema Changes

#### Tag Entity (`src/modules/tag/entities/tag.entity.ts`)
- Added `ManyToMany` relationship with `ServiceListing`
- Added `serviceListings` property to track which listings use each tag

#### ServiceListing Entity (`src/modules/service-listing/entities/service-listing.entity.ts`)
- Added `tags` property with `ManyToMany` relationship to `Tag` entity
- Configured join table `service_listing_tags` with proper foreign keys
- Added cascade option for automatic tag management

#### Migration (`src/migration/1700000000005-CreateServiceListingTags.ts`)
- Created join table `service_listing_tags`
- Composite primary key: `(service_listing_id, tag_id)`
- Foreign key constraints with `CASCADE` delete
- Indexes on both columns for query performance

### 2. DTO Updates

#### CreateServiceListingDto (`src/modules/service-listing/dto/create-service-listing.dto.ts`)
- Added optional `tags?: string[]` field
- Accepts array of tag slugs (e.g., `['typescript', 'nodejs']`)
- Validation: array of strings

#### UpdateServiceListingDto
- Automatically inherits tags field from `CreateServiceListingDto` via `PartialType`
- Allows partial updates including tags

#### ServiceListingQueryDto (`src/modules/service-listing/dto/service-listing-query.dto.ts`)
- Added optional `tags?: string[]` filter parameter
- Enables filtering listings by multiple tag slugs
- Supports combining with other filters (category, price, etc.)

### 3. Service Layer Updates

#### TagService (`src/modules/tag/tag.service.ts`)
- Added `findTagsBySlugs()` method
  - Validates all provided tag slugs exist
  - Returns array of Tag entities
  - Throws `BadRequestException` if any tags are missing

#### ServiceListingService (`src/modules/service-listing/service-listing.service.ts`)
- Injected `TagService` dependency

**Create Method:**
- Extracts tags from DTO before creating listing
- Saves listing first, then assigns tags
- Uses `findTagsBySlugs()` to validate and retrieve tags
- Updates listing with associated tags

**Update Method:**
- Loads listing with existing tags relation
- Handles tag updates separately from other fields
- Supports clearing all tags (empty array)
- Validates new tags before assignment

**FindAll Method:**
- Added `leftJoinAndSelect('listing.tags', 'tag')` to eagerly load tags
- Added tag filtering logic using `innerJoin`
- Filters by tag slugs when provided in query
- Returns listings with tags populated

**FindOne Method:**
- Changed return type to `ServiceListing | null`
- Added `relations: ['tags']` to include tags
- Consistent with findBySlug behavior

**FindBySlug Method:**
- Changed return type to `ServiceListing | null`
- Added `relations: ['tags']` to include tags

### 4. Module Updates

#### ServiceListingModule (`src/modules/service-listing/service-listing.module.ts`)
- Imported `TagModule` for tag-related functionality
- Enables injection of `TagService` into `ServiceListingService`

## API Usage Examples

### Create Listing with Tags
```http
POST /service-listings
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Advanced TypeScript Mentorship",
  "description": "Learn advanced TypeScript concepts",
  "price": 50,
  "duration": 1.5,
  "category": "technical",
  "tags": ["typescript", "nodejs", "web-development"]
}
```

### Update Listing Tags
```http
PATCH /service-listings/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "tags": ["typescript", "react", "frontend"]
}
```

### Filter Listings by Tags
```http
GET /service-listings?tags=typescript&tags=nodejs
GET /service-listings?tags=typescript,react&category=technical
```

### Get Listing with Tags
```http
GET /service-listings/:id
```

Response includes tags:
```json
{
  "id": "uuid",
  "title": "Advanced TypeScript Mentorship",
  "slug": "advanced-typescript-mentorship",
  "tags": [
    { "id": 1, "name": "TypeScript", "slug": "typescript" },
    { "id": 2, "name": "Node.js", "slug": "nodejs" }
  ]
}
```

## Key Features

✅ **Searchable via tags** - Listings can be filtered by one or more tag slugs  
✅ **Optional tagging** - Tags are not required when creating listings  
✅ **Validation** - All tag slugs must exist in the database  
✅ **Cascade updates** - Updating tags replaces all previous tags  
✅ **Clear tags** - Send empty array `[]` to remove all tags  
✅ **Combined filters** - Tag filtering works with category, price, duration filters  
✅ **Eager loading** - Tags automatically included in listing responses  

## Database Schema

```sql
CREATE TABLE service_listing_tags (
  service_listing_id UUID NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (service_listing_id, tag_id),
  FOREIGN KEY (service_listing_id) 
    REFERENCES service_listings(id) 
    ON DELETE CASCADE,
  FOREIGN KEY (tag_id) 
    REFERENCES tags(id) 
    ON DELETE CASCADE
);

CREATE INDEX IDX_service_listing_tags_service_listing 
  ON service_listing_tags(service_listing_id);

CREATE INDEX IDX_service_listing_tags_tag 
  ON service_listing_tags(tag_id);
```

## Migration Commands

Run the migration to create the join table:

```bash
npm run typeorm -- migration:run
```

To rollback:

```bash
npm run typeorm -- migration:revert
```

## Notes

- Tags must be created before they can be assigned to listings
- Tag slugs are used as identifiers (not tag IDs or names)
- Invalid tag slugs will cause validation errors
- Soft-deleted listings are excluded from tag-filtered queries
- Only active listings are returned in filtered results
