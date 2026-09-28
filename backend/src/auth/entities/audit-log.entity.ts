/**
 * #1320: `AuditLog` moved to `src/audit/entities/audit-log.entity.ts`, where the
 * canonical column set (including the `timestamp`/`details`/`isSuspicious`
 * fields) lives. Re-exported here so existing auth imports stay valid while
 * only one entity class is mapped to the `audit_logs` table.
 */
export * from '../../audit/entities/audit-log.entity';
