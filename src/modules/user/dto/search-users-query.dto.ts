/**
 * Search & Filter Users Query DTO
 * Issue: #1685
 *
 * TODO:
 * - Support query params: role, search, skill, page (default 1), limit (default 20, max 100), sortBy, sortOrder
 * - Case-insensitive partial match (ILIKE) on displayName
 * - Filter mentors by skill (skills array contains value)
 * - Sort by name, createdAt, rating (mentors only)
 * - Return sanitized public profile fields (expose email/wallet only to admins)
 * - Include pagination metadata (total, page, limit, totalPages) and Redis cache (1 min TTL)
 */
export class SearchUsersQueryDto {}
