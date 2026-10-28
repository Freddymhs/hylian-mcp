// 04:00 every day, server local time.
export const DAILY_SYNC_SCHEDULE = '0 4 * * *';
export const DAILY_SYNC_TASK_NAME = 'daily-sync';

// 03:00 on Sundays, server local time.
export const WEEKLY_BACKUP_SCHEDULE = '0 3 * * 0';
export const WEEKLY_BACKUP_TASK_NAME = 'weekly-backup';
export const BACKUP_RETENTION = 12;
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_PREFIX = 'reviews-';
export const BACKUP_FILE_EXTENSION = '.json';
export const BACKUP_FILE_PATTERN = /^reviews-\d{4}-\d{2}-\d{2}\.json$/;
export const BACKUP_HOME_DIR_NAME = '.hylian-mcp';
export const BACKUP_XDG_DIR_NAME = 'hylian-mcp';
export const BACKUP_SUBDIR = 'backups';
export const BACKUP_DIR_MODE = 0o700;
export const BACKUP_FILE_MODE = 0o600;
