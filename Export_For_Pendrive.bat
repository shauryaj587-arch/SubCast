@echo off
title Export SubCast for Pendrive
color 0B
echo.
echo  =========================================================
echo    Exporting Clean SubCast Folder for Clients
echo  =========================================================
echo.
echo  This will create a "SubCast_Client_Ready" folder on your Desktop.
echo  It removes all developer secrets and heavy modules so it's
echo  lightweight and safe to share on a pendrive.
echo.
pause

set TARGET="%USERPROFILE%\Desktop\SubCast_Client_Ready"

if exist %TARGET% (
    echo.
    echo  Removing old export...
    rmdir /S /Q %TARGET%
)

echo.
echo  Copying files... (This may take a moment)
xcopy "%~dp0*" %TARGET%\ /E /I /H /Y /EXCLUDE:%~dp0.export_ignore.txt >nul 2>&1

echo.
echo  =========================================================
echo   SUCCESS! 
echo   Your clean folder is ready at: Desktop\SubCast_Client_Ready
echo   You can copy this folder to your Pendrive now.
echo  =========================================================
echo.
pause
