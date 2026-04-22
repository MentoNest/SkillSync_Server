import { FieldDiff, ListingSnapshot } from '../entities/listing-version.entity';

export interface PaginatedVersions {
  data: VersionResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface VersionResponse {
  id: string;
  listingId: string;
  versionNumber: number;
  snapshot: ListingSnapshot;
  changedFields: FieldDiff[];
  changeNote: string | null;
  changedBy: string;
  createdAt: Date;
}

export interface VersionComparisonResult {
  listingId: string;
  v1: number;
  v2: number;
  diffs: FieldDiff[];
  v1CreatedAt: Date;
  v2CreatedAt: Date;
}

export interface RevertResult {
  listing: {
    id: string;
    currentVersion: number;
    updatedAt: Date;
  };
  newVersionNumber: number;
  revertedFrom: number;
}
