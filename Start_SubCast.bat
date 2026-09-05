@echo off
title SubCast Local Server
echo =========================================
echo       Starting SubCast Locally...
echo =========================================
echo.

if not exist "node_modules" (
    echo [INFO] First time setup: Installing dependencies...
    echo This might take a minute or two.
    npm install
)

echo [INFO] Opening browser...
start http://localhost:5173

echo [INFO] Starting development server...
npm run dev

pause
