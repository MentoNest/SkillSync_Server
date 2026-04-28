@echo off
REM Admin Seed Verification Script for Windows
REM This script helps verify that the admin seed has been properly set up and executed

cls
echo ========================================================================
echo Admin Seed Verification Script
echo ========================================================================
echo.

setlocal enabledelayedexpansion

REM Check if .env files exist
if exist ".env.local" (
    echo [OK] .env.local file exists
) else (
    echo [INFO] .env.local file not found (optional, checking other env files)
)

if exist ".env.development" (
    echo [OK] .env.development file exists
) else (
    if exist ".env" (
        echo [OK] .env file exists
    ) else (
        echo [INFO] No .env files found - using environment variables or defaults
    )
)

echo.
echo Checking required environment variables...
echo.

REM Check NODE_ENV
if defined NODE_ENV (
    echo [OK] NODE_ENV=%NODE_ENV%
) else (
    echo [INFO] NODE_ENV not set (will default to development)
)

REM Check DATABASE variables
if defined DATABASE_HOST (
    echo [OK] DATABASE_HOST=%DATABASE_HOST%
) else (
    echo [INFO] DATABASE_HOST not set (will use default: localhost)
)

if defined DATABASE_NAME (
    echo [OK] DATABASE_NAME=%DATABASE_NAME%
) else (
    echo [INFO] DATABASE_NAME not set (will use default: skillsync)
)

REM Check seed variables
if defined DISABLE_SEED (
    if "%DISABLE_SEED%"=="true" (
        echo [WARNING] DISABLE_SEED=true (seeding is disabled)
    ) else (
        echo [OK] DISABLE_SEED=%DISABLE_SEED% (seeding is enabled)
    )
) else (
    echo [OK] DISABLE_SEED not set (seeding is enabled by default)
)

if defined DEFAULT_ADMIN_WALLET (
    echo [OK] DEFAULT_ADMIN_WALLET is set
    echo     Wallet: %DEFAULT_ADMIN_WALLET%
) else (
    echo [ERROR] DEFAULT_ADMIN_WALLET not set (admin user will not be created)
)

echo.
echo Checking file structure...
echo.

REM Check for seed files
if exist "src\database\seeds\admin-seed.service.ts" (
    echo [OK] AdminSeedService found
) else (
    echo [ERROR] AdminSeedService not found
)

if exist "src\database\seeds\seed.module.ts" (
    echo [OK] SeedModule found
) else (
    echo [ERROR] SeedModule not found
)

if exist "src\database\seeds\admin-seed.service.spec.ts" (
    echo [OK] AdminSeedService tests found
) else (
    echo [ERROR] AdminSeedService tests not found
)

if exist "src\database\migrations\1713830400002-CreateUserAndRoleTablesForSeed.ts" (
    echo [OK] Seed migration found
) else (
    echo [ERROR] Seed migration not found
)

echo.
echo Checking configuration files...
echo.

REM Check app.module.ts imports SeedModule (simple grep)
findstr /M "SeedModule" "src\app.module.ts" >nul
if !errorlevel! equ 0 (
    echo [OK] SeedModule imported in AppModule
) else (
    echo [ERROR] SeedModule not imported in AppModule
)

REM Check main.ts imports AdminSeedService
findstr /M "AdminSeedService" "src\main.ts" >nul
if !errorlevel! equ 0 (
    echo [OK] AdminSeedService imported in main.ts
) else (
    echo [ERROR] AdminSeedService not imported in main.ts
)

REM Check AppConfigService has DISABLE_SEED config
findstr /M "DISABLE_SEED" "src\config\app-config.service.ts" >nul
if !errorlevel! equ 0 (
    echo [OK] DISABLE_SEED configuration added
) else (
    echo [INFO] DISABLE_SEED configuration not found
)

REM Check AppConfigService has DEFAULT_ADMIN_WALLET config
findstr /M "DEFAULT_ADMIN_WALLET" "src\config\app-config.service.ts" >nul
if !errorlevel! equ 0 (
    echo [OK] DEFAULT_ADMIN_WALLET configuration added
) else (
    echo [INFO] DEFAULT_ADMIN_WALLET configuration not found
)

echo.
echo Checking documentation...
echo.

if exist "SEED_DOCUMENTATION.md" (
    echo [OK] Comprehensive documentation found
) else (
    echo [INFO] SEED_DOCUMENTATION.md not found
)

if exist "SEED_QUICK_START.md" (
    echo [OK] Quick start guide found
) else (
    echo [INFO] SEED_QUICK_START.md not found
)

if exist ".env.example" (
    echo [OK] Environment configuration template found
) else (
    echo [INFO] .env.example not found
)

echo.
echo ========================================================================
echo Verification Summary
echo ========================================================================
echo.
echo To complete the setup:
echo.
echo 1. Configure your environment variables:
echo    - Copy .env.example to .env.local (or .env)
echo    - Set DEFAULT_ADMIN_WALLET to your admin wallet address
echo    - Configure database connection details
echo.
echo 2. Run database migrations:
echo    npm run migration:run
echo.
echo 3. Start the application:
echo    npm run start:dev
echo.
echo 4. Verify admin user was created:
echo    - Check logs for: '[Seed] Admin role created; Admin user created'
echo    - Query database for admin user and role
echo.
echo 5. Run tests to verify seeding works:
echo    npm run test -- admin-seed.service.spec
echo.
echo ========================================================================
echo.
pause
