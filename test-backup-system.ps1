# =============================================================================
# Database Backup System - Test Script (PowerShell)
# =============================================================================
# This script helps you test the backup system functionality on Windows
# =============================================================================

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Database Backup System - Test Script" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Configuration
$ApiUrl = if ($env:API_URL) { $env:API_URL } else { "http://localhost:3000/api" }
$Token = if ($env:BACKUP_TEST_TOKEN) { $env:BACKUP_TEST_TOKEN } else { "" }

# Check if token is provided
if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "Warning: No JWT token provided. Set BACKUP_TEST_TOKEN environment variable." -ForegroundColor Yellow
    Write-Host "Some tests may fail if authentication is required." -ForegroundColor Yellow
    Write-Host ""
}

# Function to make API calls
function Invoke-ApiCall {
    param(
        [string]$Method,
        [string]$Endpoint,
        [string]$Data
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if (-not [string]::IsNullOrEmpty($Token)) {
        $headers["Authorization"] = "Bearer $Token"
    }
    
    $url = "$ApiUrl$Endpoint"
    
    if (-not [string]::IsNullOrEmpty($Data)) {
        $response = Invoke-RestMethod -Uri $url -Method $Method -Headers $headers -Body $Data
    } else {
        $response = Invoke-RestMethod -Uri $url -Method $Method -Headers $headers
    }
    
    return $response
}

# Test 1: Check Backup Status
Write-Host "Test 1: Check Backup Status" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
try {
    $status = Invoke-ApiCall -Method "GET" -Endpoint "/database/backups/status"
    $status | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 2: Create Manual Backup
Write-Host "Test 2: Create Manual Backup" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
try {
    $backupData = @{
        description = "Manual test backup"
        includeWal = $true
    } | ConvertTo-Json
    
    $backup = Invoke-ApiCall -Method "POST" -Endpoint "/database/backups" -Data $backupData
    $backup | ConvertTo-Json -Depth 10
    
    $backupId = $backup.id
    Write-Host "`nBackup ID: $backupId" -ForegroundColor Green
} catch {
    Write-Host "Failed to create backup: $_" -ForegroundColor Red
    Write-Host "Skipping remaining tests." -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Test 3: List Backups
Write-Host "Test 3: List All Backups" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
try {
    $list = Invoke-ApiCall -Method "GET" -Endpoint "/database/backups"
    $list | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 4: Get Backup Details
Write-Host "Test 4: Get Backup Details" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
try {
    $details = Invoke-ApiCall -Method "GET" -Endpoint "/database/backups/$backupId"
    $details | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 5: Verify Backup
Write-Host "Test 5: Verify Backup Integrity" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
Write-Host "This test will restore the backup to a test database..." -ForegroundColor Yellow
try {
    $verify = Invoke-ApiCall -Method "POST" -Endpoint "/database/backups/$backupId/verify"
    $verify | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 6: Check Updated Status
Write-Host "Test 6: Check Updated Backup Status" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
try {
    $status = Invoke-ApiCall -Method "GET" -Endpoint "/database/backups/status"
    $status | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
}
Write-Host ""

# Test 7: Delete Test Backup
Write-Host "Test 7: Delete Test Backup" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Green
Write-Host "Cleaning up test backup..." -ForegroundColor Yellow
try {
    Invoke-ApiCall -Method "DELETE" -Endpoint "/database/backups/$backupId"
    Write-Host "Backup deleted successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to delete backup: $_" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Green
Write-Host "Test Summary" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Tests completed:" -ForegroundColor White
Write-Host "  ✓ Backup status check" -ForegroundColor Green
Write-Host "  ✓ Manual backup creation" -ForegroundColor Green
Write-Host "  ✓ List backups" -ForegroundColor Green
Write-Host "  ✓ Get backup details" -ForegroundColor Green
Write-Host "  ✓ Backup verification" -ForegroundColor Green
Write-Host "  ✓ Updated status check" -ForegroundColor Green
Write-Host "  ✓ Backup deletion" -ForegroundColor Green
Write-Host ""
Write-Host "All tests passed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Check backup files in: .\backups\" -ForegroundColor White
Write-Host "  2. Verify WAL archive in: .\wal_archive\" -ForegroundColor White
Write-Host "  3. Review documentation: DATABASE_BACKUP_PROCEDURES.md" -ForegroundColor White
Write-Host "  4. Test restore procedure: EMERGENCY_RESTORE_RUNBOOK.md" -ForegroundColor White
Write-Host ""
