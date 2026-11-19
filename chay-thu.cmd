@echo off
title Hoi cho online - chay thu
set "ROOT=%~dp0"
cd /d "%ROOT%server"

where node >nul 2>nul
if errorlevel 1 goto nonode
for /f "tokens=1,2 delims=v." %%a in ('node -v') do (
  set MAJ=%%a
  set MIN=%%b
)
if %MAJ% LSS 22 goto oldnode
if %MAJ% EQU 22 if %MIN% LSS 13 goto oldnode

if not exist "..\client\www\index.html" call :build

set DEV_LOGIN=1
set ADMIN_KEY=hoicho2026
echo Dang mo Hoi cho online tai http://localhost:8787
echo Trang quan tri: http://localhost:8787/admin  (ma: hoicho2026)
echo Dong cua so nay de tat may chu.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8787"
node --disable-warning=ExperimentalWarning src\index.js
pause
exit /b

:nonode
echo Chua cai Node.js. Tai ban LTS (22 tro len) tai https://nodejs.org, cai xong thi bam dup lai file nay.
start "" https://nodejs.org
pause
exit /b

:oldnode
echo May dang co Node.js %MAJ%.%MIN%, can ban 22.13 tro len.
echo Tai ban LTS moi tai https://nodejs.org, cai de len ban cu roi bam dup lai file nay.
start "" https://nodejs.org
pause
exit /b

:build
rem Ban lay tu GitHub chua co client\www (khong dua len git): tu build lan dau.
echo Lan dau chay: dang cai thu vien va build giao dien (do hoa Three.js), mat khoang 1 phut...
echo.
pushd "%ROOT%client"
call npm install --no-audit --no-fund
if errorlevel 1 goto buildfail
call npm run build
if errorlevel 1 goto buildfail
popd
echo.
echo Build xong.
echo.
exit /b

:buildfail
popd
echo.
echo [Luu y] Build khong thanh cong (kiem tra mang Internet). Tam thoi chay ban do hoa CSS 3D.
echo         Co the thu lai: vao thu muc client, chay "npm install" roi "npm run build".
echo.
exit /b
