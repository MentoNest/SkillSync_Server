/**
 * Security Configuration for Suspicious Login Detection
 * 
 * All values can be configured via environment variables
 */

export const suspiciousLoginDetectionConfig = {
  // Failed attempts configuration
  maxFailedAttempts: {
    envKey: 'SECURITY_MAX_FAILED_ATTEMPTS',
    defaultValue: 5,
    description: 'Maximum failed login attempts before lockout',
  },

  // Time window for failed attempts
  timeWindowMinutes: {
    envKey: 'SECURITY_TIME_WINDOW_MINUTES',
    defaultValue: 15,
    description: 'Time window in minutes for counting failed attempts',
  },

  // Account lockout duration
  lockoutDurationMinutes: {
    envKey: 'SECURITY_LOCKOUT_DURATION_MINUTES',
    defaultValue: 30,
    description: 'Duration in minutes to lock account after suspicious activity',
  },

  // IP history retention
  ipHistoryRetentionDays: {
    envKey: 'SECURITY_IP_HISTORY_RETENTION_DAYS',
    defaultValue: 30,
    description: 'Number of days to retain IP login history',
  },

  // Abnormal login time detection
  enableAbnormalTimeDetection: {
    envKey: 'SECURITY_ENABLE_ABNORMAL_TIME_DETECTION',
    defaultValue: true,
    description: 'Enable detection of abnormal login times',
  },

  abnormalTimeThresholdHours: {
    envKey: 'SECURITY_ABNORMAL_TIME_THRESHOLD_HOURS',
    defaultValue: 6,
    description: 'Hours threshold for considering login time abnormal',
  },

  // Geographic distance checks
  enableImpossibleTravelDetection: {
    envKey: 'SECURITY_ENABLE_IMPOSSIBLE_TRAVEL_DETECTION',
    defaultValue: true,
    description: 'Enable detection of impossible travel between login locations',
  },

  maxTravelSpeedKmh: {
    envKey: 'SECURITY_MAX_TRAVEL_SPEED_KMH',
    defaultValue: 900,
    description: 'Maximum reasonable travel speed in km/h (commercial flight speed)',
  },

  // New IP detection
  enableNewIPDetection: {
    envKey: 'SECURITY_ENABLE_NEW_IP_DETECTION',
    defaultValue: true,
    description: 'Enable detection of login attempts from new IP addresses',
  },

  // Alert configuration
  enableEmailAlerts: {
    envKey: 'SECURITY_ENABLE_EMAIL_ALERTS',
    defaultValue: false,
    description: 'Send email alerts to admins for suspicious activity',
  },

  adminAlertEmail: {
    envKey: 'SECURITY_ADMIN_ALERT_EMAIL',
    defaultValue: '',
    description: 'Email address to send security alerts to',
  },

  enableWebhookAlerts: {
    envKey: 'SECURITY_ENABLE_WEBHOOK_ALERTS',
    defaultValue: false,
    description: 'Send webhook alerts for suspicious activity',
  },

  webhookUrl: {
    envKey: 'SECURITY_WEBHOOK_URL',
    defaultValue: '',
    description: 'Webhook URL to send security alerts to',
  },

  enableSMSAlerts: {
    envKey: 'SECURITY_ENABLE_SMS_ALERTS',
    defaultValue: false,
    description: 'Send SMS alerts to admins for suspicious activity',
  },

  // Risk scoring configuration
  riskThresholdForLockout: {
    envKey: 'SECURITY_RISK_THRESHOLD_FOR_LOCKOUT',
    defaultValue: 70,
    description: 'Risk score threshold (0-100) for automatic account lockout',
  },

  riskThresholdForSuspicious: {
    envKey: 'SECURITY_RISK_THRESHOLD_FOR_SUSPICIOUS',
    defaultValue: 30,
    description: 'Risk score threshold (0-100) for marking as suspicious',
  },

  // Geolocation service
  geolocationServiceProvider: {
    envKey: 'GEOLOCATION_SERVICE_PROVIDER',
    defaultValue: 'mock',
    description: 'Geolocation service provider (mock, ipstack, maxmind, etc.)',
  },

  geolocationServiceKey: {
    envKey: 'GEOLOCATION_SERVICE_KEY',
    defaultValue: '',
    description: 'API key for geolocation service',
  },

  // Audit logging
  enableAuditLogging: {
    envKey: 'SECURITY_ENABLE_AUDIT_LOGGING',
    defaultValue: true,
    description: 'Enable detailed audit logging for login attempts',
  },

  auditLogRetentionDays: {
    envKey: 'SECURITY_AUDIT_LOG_RETENTION_DAYS',
    defaultValue: 90,
    description: 'Number of days to retain audit logs',
  },

  // Behavioral analysis
  enableBehavioralAnalysis: {
    envKey: 'SECURITY_ENABLE_BEHAVIORAL_ANALYSIS',
    defaultValue: false,
    description: 'Enable machine learning-based behavioral analysis (future)',
  },

  // Dashboard and reporting
  enableSecurityDashboard: {
    envKey: 'SECURITY_ENABLE_DASHBOARD',
    defaultValue: true,
    description: 'Enable admin security dashboard',
  },

  dashboardAccessRole: {
    envKey: 'SECURITY_DASHBOARD_ACCESS_ROLE',
    defaultValue: 'admin,moderator',
    description: 'Roles allowed to access security dashboard',
  },
};

/**
 * Example .env file entries:
 * 
 * # Security Configuration
 * SECURITY_MAX_FAILED_ATTEMPTS=5
 * SECURITY_TIME_WINDOW_MINUTES=15
 * SECURITY_LOCKOUT_DURATION_MINUTES=30
 * SECURITY_IP_HISTORY_RETENTION_DAYS=30
 * SECURITY_ENABLE_ABNORMAL_TIME_DETECTION=true
 * SECURITY_ABNORMAL_TIME_THRESHOLD_HOURS=6
 * SECURITY_ENABLE_IMPOSSIBLE_TRAVEL_DETECTION=true
 * SECURITY_MAX_TRAVEL_SPEED_KMH=900
 * SECURITY_ENABLE_NEW_IP_DETECTION=true
 * 
 * # Alerts
 * SECURITY_ENABLE_EMAIL_ALERTS=true
 * SECURITY_ADMIN_ALERT_EMAIL=admin@skillsync.io
 * SECURITY_ENABLE_WEBHOOK_ALERTS=true
 * SECURITY_WEBHOOK_URL=https://webhook.example.com/security-alerts
 * 
 * # Risk Scoring
 * SECURITY_RISK_THRESHOLD_FOR_LOCKOUT=70
 * SECURITY_RISK_THRESHOLD_FOR_SUSPICIOUS=30
 * 
 * # Geolocation
 * GEOLOCATION_SERVICE_PROVIDER=mock
 * GEOLOCATION_SERVICE_KEY=your_api_key_here
 */
