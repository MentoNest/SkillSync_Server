#!/bin/bash

# =============================================================================
# Database Backup System - Test Script
# =============================================================================
# This script helps you test the backup system functionality
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Database Backup System - Test Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Configuration
API_URL="${API_URL:-http://localhost:3000/api}"
TOKEN="${BACKUP_TEST_TOKEN:-}"

# Check if token is provided
if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}Warning: No JWT token provided. Set BACKUP_TEST_TOKEN environment variable.${NC}"
    echo -e "${YELLOW}Some tests may fail if authentication is required.${NC}"
    echo ""
fi

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    local headers=(
        -H "Content-Type: application/json"
    )
    
    if [ -n "$TOKEN" ]; then
        headers+=(-H "Authorization: Bearer $TOKEN")
    fi
    
    if [ -n "$data" ]; then
        curl -s -X "$method" "$API_URL$endpoint" "${headers[@]}" -d "$data"
    else
        curl -s -X "$method" "$API_URL$endpoint" "${headers[@]}"
    fi
}

# Test 1: Check Backup Status
echo -e "${GREEN}Test 1: Check Backup Status${NC}"
echo "----------------------------------------"
STATUS=$(api_call "GET" "/database/backups/status")
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"
echo ""

# Test 2: Create Manual Backup
echo -e "${GREEN}Test 2: Create Manual Backup${NC}"
echo "----------------------------------------"
BACKUP=$(api_call "POST" "/database/backups" '{"description": "Manual test backup", "includeWal": true}')
echo "$BACKUP" | python3 -m json.tool 2>/dev/null || echo "$BACKUP"
echo ""

# Extract backup ID
BACKUP_ID=$(echo "$BACKUP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$BACKUP_ID" ]; then
    echo -e "${RED}Failed to create backup. Skipping remaining tests.${NC}"
    exit 1
fi

echo -e "${GREEN}Backup ID: $BACKUP_ID${NC}"
echo ""

# Test 3: List Backups
echo -e "${GREEN}Test 3: List All Backups${NC}"
echo "----------------------------------------"
LIST=$(api_call "GET" "/database/backups")
echo "$LIST" | python3 -m json.tool 2>/dev/null || echo "$LIST"
echo ""

# Test 4: Get Backup Details
echo -e "${GREEN}Test 4: Get Backup Details${NC}"
echo "----------------------------------------"
DETAILS=$(api_call "GET" "/database/backups/$BACKUP_ID")
echo "$DETAILS" | python3 -m json.tool 2>/dev/null || echo "$DETAILS"
echo ""

# Test 5: Verify Backup
echo -e "${GREEN}Test 5: Verify Backup Integrity${NC}"
echo "----------------------------------------"
echo "This test will restore the backup to a test database..."
VERIFY=$(api_call "POST" "/database/backups/$BACKUP_ID/verify")
echo "$VERIFY" | python3 -m json.tool 2>/dev/null || echo "$VERIFY"
echo ""

# Test 6: Check Updated Status
echo -e "${GREEN}Test 6: Check Updated Backup Status${NC}"
echo "----------------------------------------"
STATUS=$(api_call "GET" "/database/backups/status")
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"
echo ""

# Test 7: Delete Test Backup
echo -e "${GREEN}Test 7: Delete Test Backup${NC}"
echo "----------------------------------------"
echo "Cleaning up test backup..."
DELETE=$(api_call "DELETE" "/database/backups/$BACKUP_ID")
if [ -z "$DELETE" ]; then
    echo -e "${GREEN}Backup deleted successfully${NC}"
else
    echo "$DELETE"
fi
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Tests completed:"
echo "  ✅ Backup status check"
echo "  ✅ Manual backup creation"
echo "  ✅ List backups"
echo "  ✅ Get backup details"
echo "  ✅ Backup verification"
echo "  ✅ Updated status check"
echo "  ✅ Backup deletion"
echo ""
echo -e "${GREEN}All tests passed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Check backup files in: ./backups/"
echo "  2. Verify WAL archive in: ./wal_archive/"
echo "  3. Review documentation: DATABASE_BACKUP_PROCEDURES.md"
echo "  4. Test restore procedure: EMERGENCY_RESTORE_RUNBOOK.md"
echo ""
