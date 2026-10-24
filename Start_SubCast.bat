@echo off
title SubCast Local Server
echo =========================================
echo       Starting SubCast Locally...
echo =========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed on this PC!
    echo.
    echo SubCast runs locally in your browser using Node.js.
    echo Please download and install Node.js ^(LTS version^) from:
    echo https://nodejs.org
    echo.
    echo Once installed, double-click this file again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] First time setup: Installing dependencies...
    echo This might take 1-2 minutes depending on your internet.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install failed. Please check your internet connection.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully!
    echo.
)

:: Auto-create Desktop Shortcut if not already present
if not exist "%USERPROFILE%\Desktop\SubCast.lnk" (
    echo [INFO] Creating Desktop shortcut...
    set SCRIPT="%TEMP%\SubCastShortcut.vbs"
    echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
    echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\SubCast.lnk" >> %SCRIPT%
    echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
    echo oLink.TargetPath = "%~dp0Launch_SubCast.vbs" >> %SCRIPT%
    echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
    echo oLink.Description = "SubCast - Auto Subtitles for Reels" >> %SCRIPT%
    echo oLink.IconLocation = "%~dp0public\subcast.ico" >> %SCRIPT%
    echo oLink.Save >> %SCRIPT%
    cscript /nologo %SCRIPT% >nul 2>&1
    del %SCRIPT% >nul 2>&1
    echo [OK] SubCast Desktop shortcut created!
    echo.
)

echo [INFO] Opening browser at http://localhost:5173 ...
start http://localhost:5173

echo [INFO] Starting development server...
npm run dev

pause
