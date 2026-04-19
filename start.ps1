# Start Backend Server
Write-Host "Starting Socialite Backend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python run.py"

# Wait 2 seconds for backend to initialize
Start-Sleep -Seconds 2

# Start Frontend Dev Server
Write-Host "Starting Socialite Frontend..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host ""
Write-Host "Both servers starting..." -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Yellow
Write-Host ""
Write-Host "Remember to set your MONGODB_URI in backend/.env before starting!" -ForegroundColor Red
