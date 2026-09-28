/**
 * #1320: the audit log entity now has a single definition, living next to the
 * service and controller that use it. Re-exported here so the historical
 * import path keeps working.
 */
export * from '../audit/entities/audit-log.entity';
