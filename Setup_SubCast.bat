@echo off
title SubCast Setup
color 0A
echo.
echo  =========================================================
echo     _____       _      _____          _   
echo    / ____|     ^| ^|    / ____|        ^| ^|  
echo   ^| (___  _   _^| ^|__^| ^|     __ _ ___^| ^|_ 
echo    \___ \^| ^| ^| ^| '_ \^| ^|    / _` / __^| __^|
echo    ____) ^| ^|_^| ^| ^|_) ^| ^|___^| ^(_^| \__ \ ^|_ 
echo   ^|_____/ \__,_^|_.__/ \_____\__,_^|___/\__^|
echo.
echo   Auto Subtitles for Reels - Setup Wizard
echo  =========================================================
echo.

:: Step 1: Check Node.js
echo  [1/4] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js is not installed!
    echo  Please download and install from: https://nodejs.org
    echo  Then run this setup again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo         Found Node.js %%v - OK

:: Step 2: Install dependencies
echo.
echo  [2/4] Installing dependencies...
if not exist "node_modules" (
    echo         First time setup - this may take 1-2 minutes...
    npm install >nul 2>&1
    if %errorlevel% neq 0 (
        echo  ERROR: npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo         Dependencies installed successfully!
) else (
    echo         Dependencies already installed - OK
)

:: Step 3: Create desktop shortcut with SubCast icon
echo.
echo  [3/4] Creating desktop shortcut...

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
echo         Desktop shortcut created!

:: Step 4: Done
echo.
echo  [4/4] Setup complete!
echo.
echo  =========================================================
echo.
echo   SubCast has been installed successfully!
echo.
echo   HOW TO USE:
echo   - Double-click the "SubCast" icon on your Desktop
echo   - Or run "Launch_SubCast.vbs" from this folder
echo.
echo   FIRST TIME:
echo   - AI model (~40MB) will download on first use
echo   - After that, it loads instantly from cache
echo.
echo  =========================================================
echo.
pause
