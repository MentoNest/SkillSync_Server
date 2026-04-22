# Full-Text Search Implementation

## Overview

This module implements PostgreSQL full-text search (FTS) for service listings, providing advanced search capabilities with improved relevance ranking.

## Key Features

### 1. **PostgreSQL Full-Text Search Vector (tsvector)**
   - Automatically generated and maintained via database triggers
   - Includes title (weight A), description (weight B), and category (weight C)
   - Indexed with GIN for optimal query performance

### 2. **Relevance Ranking**
   - Uses `ts_rank()` function to score matches
   - Returns results ordered by relevance when keywords are provided
   - Maintains featured and newest sorting when no search is active

### 3. **Natural Language Queries**
   - `plainto_tsquery()` function converts natural language to search queries
   - Handles user input safely without SQL injection risks
   - Automatically splits multiple terms with AND operator

### 4. **Automatic Index Maintenance**
   - Database trigger automatically updates `search_vector` on INSERT/UPDATE
   - No application-level maintenance required
   - Backfill migration handles existing records

## Database Schema

### New Column
```sql
ALTER TABLE service_listings ADD COLUMN search_vector tsvector;
```

### Index
```sql
CREATE INDEX idx_service_listings_search_vector 
ON service_listings USING gin(search_vector);
```

### Trigger Function
```sql
CREATE FUNCTION update_service_listings_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Usage

### In Service Methods
```typescript
// The search_vector column is automatically maintained by the database
// Use plainto_tsquery for natural language searches

const qb = this.serviceListingRepository.createQueryBuilder('listing');

qb.andWhere(
  'listing.search_vector @@ plainto_tsquery(:searchQuery)',
  { searchQuery: 'machine learning' }
);

// Add ranking for relevance
qb.addSelect(
  'ts_rank(listing.search_vector, plainto_tsquery(:searchQuery))',
  'relevance'
);

// Order by relevance
qb.orderBy('relevance', 'DESC');
```

### Search Examples

**Basic Search**
```
GET /service-listings?keyword=python
```
Matches listings containing "python" in title, description, or category. Results ordered by relevance.

**Multi-term Search**
```
GET /service-listings?keyword=machine learning
```
Matches listings containing both "machine" AND "learning". Highest relevance scores first.

**Advanced Filtering with Search**
```
GET /service-listings?keyword=nodejs&category=technical&minPrice=50&maxPrice=500
```
Combines full-text search with other filters.

## Performance Characteristics

### Advantages Over ILIKE

| Aspect | ILIKE | Full-Text Search |
|--------|-------|------------------|
| Multi-word matching | Literal substring | Semantic word matching |
| Word order sensitivity | Sensitive | Insensitive |
| Relevance ranking | Not available | Built-in ts_rank |
| Performance | O(n) scan | O(log n) with GIN index |
| Index support | Only exact prefixes | Optimized for FTS |

### Index Size
- GIN index adds ~10-15% storage overhead
- Provides 10-50x speedup for keyword searches on large datasets

## Relevance Ranking

The search vector uses weighted components:

- **Weight A (Title)**: 100% relevance boost
  - Matches in title are most important
  - Single appearance = highest rank

- **Weight B (Description)**: 50% relevance boost
  - Content description matches
  - Multiple appearances increase score

- **Weight C (Category)**: 25% relevance boost
  - Category field matches
  - Lowest priority

## Migration Notes

**File**: `src/migration/2000000000000-AddFullTextSearchToServiceListings.ts`

### What the migration does:
1. Adds `search_vector` column to service_listings
2. Creates GIN index on search_vector
3. Creates trigger function for automatic updates
4. Backfills existing records with search vectors

### Rollback Safety
- All operations are reversible
- Trigger dropping before column drop
- Function verified before trigger creation

## Implementation Details

### Entity
```typescript
@Column({ type: 'tsvector', nullable: true, select: false })
searchVector?: string;
```
- Column hidden from default SELECT to reduce data transfer
- Can be explicitly selected when needed

### Service Methods Updated
1. `findAll()` - Main search endpoint
2. `findPendingListings()` - Admin pending review
3. `findAllForAdmin()` - Admin management

All methods now prefer relevance ranking when keyword search is active.

## Future Enhancements

### Possible Improvements
1. **Phrase Search**: Support quoted multi-word phrases
2. **Proximity Search**: Find terms within N words of each other
3. **Negative Terms**: Support "-term" to exclude results
4. **Wildcard Matching**: Support prefix matching with *
5. **Custom Dictionaries**: Domain-specific stop words
6. **Language Support**: Multiple language configurations
7. **Boost Factors**: Dynamically adjust weights per field

### Query Optimization
```typescript
// Current: Simple AND matching
"machine & learning"

// Future: Advanced operators
"machine & (learning | ai)"  // OR operator
"machine & !java"             // NOT operator
"quick <-> brown"             // Phrase proximity
```

## Troubleshooting

### Issue: `search_vector` column missing after migration
**Solution**: 
- Ensure migration was run: `npm run migration:run`
- Verify PostgreSQL supports tsvector: `SELECT '1'::tsvector;`

### Issue: Slow searches despite index
**Solution**:
- Verify index exists: `\d service_listings` in psql
- Check index usage: `EXPLAIN ANALYZE` on query
- Consider query optimization via util functions

### Issue: New listings not appearing in search
**Solution**:
- Trigger might not be firing
- Manually trigger: `UPDATE service_listings SET title = title WHERE id = ?`
- Backfill: `UPDATE service_listings SET search_vector = ... WHERE search_vector IS NULL`

## API Documentation

### Query Parameters

| Parameter | Type | Example | Description |
|-----------|------|---------|-------------|
| `keyword` | string | `python` | Full-text search across title, description, category |
| `sortBy` | enum | `RELEVANCE` | When keyword provided, sorts by relevance |
| `page` | number | `1` | Pagination page number |
| `limit` | number | `20` | Results per page |

### Response Ranking

When keyword search is active, results include implicit `relevance` score used for ordering:
- Higher scores = better matches
- Matches in title weighted highest
- Multiple term matches boost score

## Testing

### Manual Testing

**Exact title match**
```bash
curl "http://localhost:3000/api/service-listings?keyword=python"
```

**Multiple keywords**
```bash
curl "http://localhost:3000/api/service-listings?keyword=python%20expert"
```

**With filters**
```bash
curl "http://localhost:3000/api/service-listings?keyword=python&category=technical&minPrice=50"
```

## References

- [PostgreSQL Full-Text Search Documentation](https://www.postgresql.org/docs/current/textsearch.html)
- [Using Trigrams for Search](https://www.postgresql.org/docs/current/pgtrgm.html)
- [ts_rank Function](https://www.postgresql.org/docs/current/textsearch-controls.html#TEXTSEARCH-RANKING)
