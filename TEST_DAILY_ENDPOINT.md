# Testing Daily.co Endpoint

## PowerShell Commands

Since you're on Windows PowerShell, use these commands:

### Option 1: Use PowerShell's Invoke-RestMethod (Recommended)

```powershell
# Test with all parameters
$body = @{
    roomName = "tabeeb25"
    userId = "test-user-123"
    userName = "Test User"
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri "http://localhost:3000/api/daily/session" -Method Post -Body $body -Headers $headers
```

### Option 2: Use curl.exe (not curl alias)

```powershell
# Use curl.exe explicitly (not the PowerShell alias)
curl.exe -X POST http://localhost:3000/api/daily/session `
    -H "Content-Type: application/json" `
    -d '{\"roomName\": \"tabeeb25\"}'
```

### Option 3: Run the Test Script

```powershell
# Navigate to backend directory
cd Patient2.0\Patient\backend

# Run the PowerShell test script
.\test_daily_powershell.ps1
```

## Quick Test Commands

### Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/daily/health" -Method Get
```

### Generate Token (Simple)
```powershell
$body = '{"roomName": "tabeeb25"}' | ConvertFrom-Json | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/daily/session" -Method Post -Body $body -ContentType "application/json"
```

### Generate Token (One-liner)
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/daily/session" -Method Post -Body '{"roomName":"tabeeb25"}' -ContentType "application/json"
```

## Expected Response

```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "roomName": "tabeeb25"
}
```

## Troubleshooting

### If you get connection errors:
1. Make sure backend server is running: `node server.js`
2. Check the port (default is 3000)
3. Verify the endpoint: `http://localhost:3000/api/daily/health`

### If you get token errors:
1. Check Daily API key is correct
2. Verify Daily API is accessible
3. Check backend logs for errors

