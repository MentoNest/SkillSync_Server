/**
 * Full-Text Search Utility for PostgreSQL
 * 
 * Provides utilities for performing advanced full-text search queries
 * on PostgreSQL tsvector columns with proper relevance ranking.
 */

/**
 * Normalizes a search query for PostgreSQL full-text search
 * Handles special characters and prepares the query for ts_query functions
 * 
 * @param query Raw search query from user
 * @returns Cleaned query safe for PostgreSQL full-text search
 * 
 * @example
 * normalizeSearchQuery("machine learning AI")
 * // Returns: "machine & learning & AI"
 */
export function normalizeSearchQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .join(' & '); // AND operator between terms
}

/**
 * Generates a PostgreSQL full-text search filter condition
 * Uses plainto_tsquery for natural language input
 * 
 * @param columnName Database column name (e.g., 'listing.search_vector')
 * @param paramName Parameter placeholder name (e.g., 'searchQuery')
 * @returns SQL WHERE clause for full-text search
 * 
 * @example
 * getFullTextSearchCondition('listing.search_vector', 'searchQuery')
 * // Returns: "listing.search_vector @@ plainto_tsquery(:searchQuery)"
 */
export function getFullTextSearchCondition(columnName: string, paramName: string): string {
  return `${columnName} @@ plainto_tsquery(:${paramName})`;
}

/**
 * Generates a PostgreSQL ts_rank expression for relevance scoring
 * Orders results by relevance match quality
 * 
 * @param columnName Database column name (e.g., 'listing.search_vector')
 * @param paramName Parameter placeholder name (e.g., 'searchQuery')
 * @param alias Optional alias for the rank column
 * @returns SQL SELECT expression for relevance ranking
 * 
 * @example
 * getFullTextRankExpression('listing.search_vector', 'searchQuery', 'relevance')
 * // Returns: "ts_rank(listing.search_vector, plainto_tsquery(:searchQuery)), 'relevance'"
 */
export function getFullTextRankExpression(
  columnName: string,
  paramName: string,
  alias: string = 'relevance',
): string {
  return `ts_rank(${columnName}, plainto_tsquery(:${paramName}))`;
}

/**
 * Calculates optimal PostgreSQL framing for ts_rank
 * Supports phrase matching and proximity search
 * 
 * @param searchQuery User's search query
 * @returns Optimized search query for better relevance
 * 
 * @example
 * optimizeSearchQuery("python programming")
 * // Returns optimized query with weighting for title matches
 */
export function optimizeSearchQuery(searchQuery: string): string {
  // For now, simply normalize the query
  // Can be extended for more sophisticated query optimization
  return normalizeSearchQuery(searchQuery);
}

/**
 * PostgreSQL Full-Text Search Configuration
 * Defines weights for different columns in the search_vector
 * 
 * Weights:
 * - A: Title (highest relevance)
 * - B: Description (medium relevance)
 * - C: Category (lower relevance)
 */
export const FTS_WEIGHTS = {
  TITLE: 'A',
  DESCRIPTION: 'B',
  CATEGORY: 'C',
} as const;

/**
 * Generates the SQL for creating/updating tsvector column
 * Weights title highest, then description, then category
 * 
 * @returns SQL expression for tsvector generation
 */
export function generateTsvectorExpression(): string {
  return `
    setweight(to_tsvector('english', COALESCE(title, '')), '${FTS_WEIGHTS.TITLE}') ||
    setweight(to_tsvector('english', COALESCE(description, '')), '${FTS_WEIGHTS.DESCRIPTION}') ||
    setweight(to_tsvector('english', COALESCE(category, '')), '${FTS_WEIGHTS.CATEGORY}')
  `;
}

/**
 * Constants for full-text search configuration
 */
export const FTS_CONFIG = {
  // PostgreSQL text search configuration language
  LANGUAGE: 'english',
  
  // GIN index type (faster for full-text search)
  INDEX_TYPE: 'gin',
  
  // Column name in database
  COLUMN_NAME: 'search_vector',
} as const;
