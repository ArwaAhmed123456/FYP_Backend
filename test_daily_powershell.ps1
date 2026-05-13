# PowerShell script to test Daily.co session endpoint
# Run with: .\test_daily_powershell.ps1

$baseUrl = "http://localhost:3000"
$endpoint = "$baseUrl/api/daily/session"

Write-Host "🧪 Testing Daily.co Session Endpoint" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "1️⃣ Testing GET /api/daily/health" -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$baseUrl/api/daily/health" -Method Get
    Write-Host "   ✅ Health check passed!" -ForegroundColor Green
    Write-Host "   Service: $($healthResponse.service)" -ForegroundColor Cyan
    Write-Host "   API Key Configured: $($healthResponse.apiKeyConfigured)" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "   ❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 2: Generate Token with all params
Write-Host "2️⃣ Testing POST /api/daily/session (with params)" -ForegroundColor Yellow
try {
    $body = @{
        roomName = "tabeeb25"
        userId = "test-user-123"
        userName = "Test User"
    } | ConvertTo-Json

    $headers = @{
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -Headers $headers
    
    if ($response.success -and $response.token) {
        Write-Host "   ✅ Token generated successfully!" -ForegroundColor Green
        Write-Host "   Room Name: $($response.roomName)" -ForegroundColor Cyan
        Write-Host "   Token: $($response.token.Substring(0, [Math]::Min(50, $response.token.Length)))..." -ForegroundColor Cyan
        Write-Host "   Token Length: $($response.token.Length) characters" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "   ❌ Failed to generate token" -ForegroundColor Red
        Write-Host "   Response: $($response | ConvertTo-Json)" -ForegroundColor Red
        Write-Host ""
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

# Test 3: Generate Token without params (defaults)
Write-Host "3️⃣ Testing POST /api/daily/session (no params)" -ForegroundColor Yellow
try {
    $body = @{} | ConvertTo-Json
    $headers = @{
        "Content-Type" = "application/json"
    }

    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -Headers $headers
    
    if ($response.success -and $response.token) {
        Write-Host "   ✅ Token generated with defaults!" -ForegroundColor Green
        Write-Host "   Room Name: $($response.roomName)" -ForegroundColor Cyan
        Write-Host "   Token: $($response.token.Substring(0, [Math]::Min(50, $response.token.Length)))..." -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "   ❌ Failed to generate token" -ForegroundColor Red
        Write-Host ""
    }
} catch {
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "✅ Testing complete!" -ForegroundColor Green

