#!/bin/bash
# Swarm PostgreSQL Backup Script (DEV)
# Runs via cron - handles daily/weekly/monthly rotation

set -e

BACKUP_ROOT="/mnt/swarm_volume_dev_db_backup/postgresql"
DB_NAME="swarmdb"
DB_USER="swarm"
DB_PASS="swarm_dev_2024"
DB_HOST="127.0.0.1"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)
LOG_FILE="$BACKUP_ROOT/backup.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Ensure backup directories exist
mkdir -p "$BACKUP_ROOT"/{daily,weekly,monthly,manual}

log "Starting PostgreSQL backup..."

# Check PostgreSQL is running
if ! pg_isready -h $DB_HOST -q; then
    log "ERROR: PostgreSQL is not running"
    exit 1
fi

# Create compressed backup using pg_dump (use TCP connection with password)
DAILY_FILE="$BACKUP_ROOT/daily/swarmdb_${TIMESTAMP}.sql.gz"
PGPASSWORD="$DB_PASS" pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME --no-owner --no-acl | gzip > "$DAILY_FILE"

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$DAILY_FILE" | cut -f1)
    log "Daily backup created: $DAILY_FILE ($SIZE)"
else
    log "ERROR: pg_dump failed"
    exit 1
fi

# Weekly backup (Sundays)
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    WEEKLY_FILE="$BACKUP_ROOT/weekly/swarmdb_week_${TIMESTAMP}.sql.gz"
    cp "$DAILY_FILE" "$WEEKLY_FILE"
    log "Weekly backup created: $WEEKLY_FILE"
fi

# Monthly backup (1st of month)
if [ "$DAY_OF_MONTH" -eq "01" ]; then
    MONTHLY_FILE="$BACKUP_ROOT/monthly/swarmdb_month_${TIMESTAMP}.sql.gz"
    cp "$DAILY_FILE" "$MONTHLY_FILE"
    log "Monthly backup created: $MONTHLY_FILE"
fi

# Rotation: Keep last 7 daily, 4 weekly, 12 monthly
cd "$BACKUP_ROOT/daily" && ls -t *.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -- 2>/dev/null || true
cd "$BACKUP_ROOT/weekly" && ls -t *.sql.gz 2>/dev/null | tail -n +5 | xargs -r rm -- 2>/dev/null || true
cd "$BACKUP_ROOT/monthly" && ls -t *.sql.gz 2>/dev/null | tail -n +13 | xargs -r rm -- 2>/dev/null || true

log "Rotation complete. PostgreSQL backup finished successfully."

# Output summary for manual runs
echo "Backup complete: $DAILY_FILE"
echo "Size: $SIZE"
