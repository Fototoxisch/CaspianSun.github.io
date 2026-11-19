# Caspian Sun — Генератор каталога товаров (PowerShell)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CASPIAN SUN: Генерация статических страниц товаров" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue

if (-not $pythonCmd) {
    Write-Host "[ОШИБКА] Python не найден в системе!" -ForegroundColor Red
    Write-Host "Установите Python 3: https://www.python.org/" -ForegroundColor Yellow
    Write-Host "Обязательно отметьте галочку 'Add Python to PATH' при установке." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Нажмите Enter для выхода..."
    exit 1
}

python (Join-Path $PSScriptRoot "generate-products.py")

Write-Host ""
Write-Host "Генерация завершена." -ForegroundColor Green
Read-Host "Нажмите Enter для выхода..."
