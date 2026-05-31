import { QueryRunner } from 'typeorm';
import { getRequestId } from '../contexts/request-id.context';

// Wrap QueryRunner.query to prepend a SQL comment with the request id when present
// This helps propagate request IDs to the database for correlation
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const originalQuery = QueryRunner.prototype.query as Function;

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
QueryRunner.prototype.query = async function (query: string, parameters?: any[]) {
  try {
    const requestId = getRequestId();
    if (requestId && typeof query === 'string') {
      const comment = `/* Request-ID: ${requestId} */ `;
      if (!query.trim().startsWith('/* Request-ID:')) {
        query = comment + query;
      }
    }
  } catch (e) {
    // ignore
  }

  return originalQuery.apply(this, [query, parameters]);
};
