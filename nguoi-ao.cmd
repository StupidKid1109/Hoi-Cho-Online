@echo off
title Hoi cho online - nguoi choi ao
rem Cho 60 nguoi choi ao vao khu 1 de thu tro choi khi dong nguoi.
rem Can chay chay-thu.cmd truoc (may chu che do thu). Dong cua so nay de cho nguoi ao roi khu.
rem Doi so nguoi hoac khu: sua dong "set SO=60" va "set KHU=1" ben duoi.
set SO=60
set KHU=1
cd /d "%~dp0server"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai ban LTS tai https://nodejs.org roi bam dup lai file nay.
  pause
  exit /b
)
echo Nho chay chay-thu.cmd truoc (cua so may chu phai dang mo).
echo.
node tools\bots.mjs %SO% %KHU% http://localhost:8787
pause
