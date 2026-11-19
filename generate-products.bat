@echo off
chcp 65001 > nul
cls

echo ============================================================
echo   CASPIAN SUN - Generator stranits tovarov
echo ============================================================
echo.

python --version >nul 2>&1
if errorlevel 1 goto NO_PYTHON

python generate-products.py
goto END

:NO_PYTHON
echo [OSHIBKA] Python ne nayden v sisteme!
echo Ustanovite Python 3 s ofitsialnogo sayta: https://www.python.org/
echo Obyazatelno otmette galochku "Add Python to PATH" pri ustanovke.
echo.

:END
echo.
pause
