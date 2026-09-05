@echo off
title SubCast Publisher
color 0A
echo.
echo  =========================================================
echo    SubCast Auto-Publisher
echo  =========================================================
echo.
echo  This will upload your latest code to GitHub so clients
echo  can receive the update automatically.
echo.
pause

node scripts\publish.cjs

echo.
pause
