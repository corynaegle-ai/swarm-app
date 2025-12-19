#!/bin/bash
# Swarm Database Backup Script (DEV)
# Runs via cron - handles daily/weekly/monthly rotation

set -e

BACKUP_ROOT="/mnt/swarm_volume_dev_db_backup"
DB_PATH="/opt/swarm-platform/data/swarm.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)
LOG_FILE="$BACKUP_ROOT/backup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Ensure backup directories exist
mkdir -p "$BACKUP_ROOT"/{daily,weekly,monthly,manual}

log "Starting backup..."

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    log "ERROR: Database not found at $DB_PATH"
    exit 1
fi

# Use SQLite's .backup command (safe, handles WAL)
DAILY_FILE="$BACKUP_ROOT/daily/swarm_${TIMESTAMP}.db.gz"
sqlite3 "$DB_PATH" ".backup '/tmp/swarm_backup_temp.db'"
gzip -c /tmp/swarm_backup_temp.db > "$DAILY_FILE"
rm /tmp/swarm_backup_temp.db

log "Daily backup created: $DAILY_FILE ($(du -h "$DAILY_FILE" | cut -f1))"

# Weekly backup (Sundays)
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    WEEKLY_FILE="$BACKUP_ROOT/weekly/swarm_week_${TIMESTAMP}.db.gz"
    cp "$DAILY_FILE" "$WEEKLY_FILE"
    log "Weekly backup created: $WEEKLY_FILE"
fi

# Monthly backup (1st of month)
if [ "$DAY_OF_MONTH" -eq "01" ]; then
    MONTHLY_FILE="$BACKUP_ROOT/monthly/swarm_month_${TIMESTAMP}.db.gz"
    cp "$DAILY_FILE" "$MONTHLY_FILE"
    log "Monthly backup created: $MONTHLY_FILE"
fi

# Rotation: Keep last 7 daily, 4 weekly, 12 monthly
cd "$BACKUP_ROOT/daily" && ls -t | tail -n +8 | xargs -r rm --
cd "$BACKUP_ROOT/weekly" && ls -t | tail -n +5 | xargs -r rm --
cd "$BACKUP_ROOT/monthly" && ls -t | tail -n +13 | xargs -r rm --

log "Rotation complete. Backup finished successfully."
