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

rem Kiem tra giao dien: 0 = da moi nhat, 1 = can build lai, 2 = can cai thu vien roi build
node "%ROOT%client\scripts\build-check.mjs"
if errorlevel 2 (call :update install) else if errorlevel 1 call :update

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

:update
echo Dang cap nhat giao dien (do hoa Three.js), mat khoang 1 phut...
echo.
pushd "%ROOT%client"
if "%~1"=="install" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto updatefail
  call node scripts\build-check.mjs --installed
)
call npm run build
if errorlevel 1 goto updatefail
popd
echo.
echo Cap nhat xong.
echo.
exit /b

:updatefail
popd
echo.
echo [Luu y] Cap nhat giao dien khong thanh cong (kiem tra mang Internet).
echo         Neu da co ban build cu thi van chay ban cu; chua co thi chay do hoa CSS 3D.
echo         Co the thu lai: vao thu muc client, chay "npm install" roi "npm run build".
echo.
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
