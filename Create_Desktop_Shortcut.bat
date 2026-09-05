@echo off
echo Creating SubCast Desktop Shortcut...

set SCRIPT="%TEMP%\CreateShortcut.vbs"
echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\SubCast.lnk" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "%~dp0Launch_SubCast.vbs" >> %SCRIPT%
echo oLink.WorkingDirectory = "%~dp0" >> %SCRIPT%
echo oLink.Description = "Launch SubCast (Auto Subtitles)" >> %SCRIPT%
echo oLink.IconLocation = "%~dp0public\subcast.ico" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%

cscript /nologo %SCRIPT%
del %SCRIPT%

echo.
echo =========================================================
echo  DONE! "SubCast" shortcut created on your Desktop!
echo =========================================================
echo.
pause
