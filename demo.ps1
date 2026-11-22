# Signal Demo Script - Phase 1 Full Flow (API only)
$ErrorActionPreference = 'Stop'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$base = if ($env:DEMO_BASE_URL) { $env:DEMO_BASE_URL } else { 'http://127.0.0.1:3001' }
$suffix = [System.Guid]::NewGuid().ToString().Substring(0, 8)

# Helper: Use Invoke-RestMethod with session to avoid Security Warning prompts
function SafeApiPost($path, $body) {
    try {
        return Invoke-RestMethod -Uri "$base$path" -Method Post -Body ($body | ConvertTo-Json) -ContentType 'application/json' -WebSession $session -UseBasicParsing
    } catch {
        throw
    }
}

function SafeApiGet($path) {
    try {
        return Invoke-RestMethod -Uri "$base$path" -Method Get -WebSession $session -UseBasicParsing
    } catch {
        throw
    }
}

function AssertEq($label, $actual, $expected) {
    if ($actual -ne $expected) {
        Write-Host "  [FAIL] $label : expected=$expected actual=$actual" -ForegroundColor Red
        exit 1
    }
    Write-Host "  [OK]   $label = $actual" -ForegroundColor Green
}

function Step($name, $block) {
    Write-Host "`n=== STEP : $name ===" -ForegroundColor Cyan
    try { & $block; Write-Host '[PASS]' -ForegroundColor Green }
    catch { Write-Host "[FAIL] $_" -ForegroundColor Red; exit 1 }
}

Step 'Register company' {
    $company = SafeApiPost '/api/auth/register-company' @{
        name = "Company $suffix"
        domain = "c$suffix.demo"
        contactEmail = "admin@c$suffix.demo"
        password = 'Password123!'
    }
    AssertEq 'id present' ([string]::IsNullOrEmpty($company.id)) $false
    AssertEq 'verified' $company.verified $false
    AssertEq 'verificationStatus' $company.verificationStatus 'pending'
    $script:companyId = $company.id
    $script:domain = "c$suffix.demo"
}

Step 'Verify company' {
    # Register creates a verification token; DEV_RETURN_VERIFICATION_TOKEN=true returns it in response
    $regWithToken = SafeApiPost '/api/auth/register-company' @{
        name = "CompanyV $suffix"
        domain = "cv$suffix.demo"
        contactEmail = "admin@cv$suffix.demo"
        password = 'Password123!'
    }
    AssertEq 'token present in response' ([string]::IsNullOrEmpty($regWithToken.token)) $false

    $v = SafeApiGet "/api/auth/verify-company?token=$($regWithToken.token)"
    AssertEq 'verified flag' $v.verified $true
}

Step 'Admin login' {
    $u = SafeApiPost '/api/auth/login' @{
        email = "admin@c$suffix.demo"
        password = 'Password123!'
    }
    AssertEq 'role' $u.role 'company_admin'
    AssertEq 'email' $u.email "admin@c$suffix.demo"
}

Step 'Create question and test with audience' {
    $q = SafeApiPost '/api/questions' @{
        title = "Array Flip $suffix"
        description = "Flip an array"
        difficulty = 'easy'
    }
    $questionId = $q.id

    $today = Get-Date
    $openAt = $today.ToString('yyyy-MM-dd') + 'T00:00:00Z'
    $closeAt = $today.AddDays(30).ToString('yyyy-MM-dd') + 'T23:59:59Z'

    $tObj = SafeApiPost '/api/tests' @{
        name = "Test $suffix"
        type = 'coding'
        durationMinutes = 60
        passMark = 70
        openAt = $openAt
        closeAt = $closeAt
        audience = @{ collegeIds = @(); batches = @(); branches = @(); minCgpa = 0 }
        questions = @( @{ questionId = $questionId } )
    }
    $script:testId = $tObj.id
    AssertEq 'test name' $tObj.name ("Test $suffix")
    AssertEq 'test status' $tObj.status 'draft'
}

Step 'Eligible student gets 200 on test' {
    $tests = SafeApiGet '/api/tests'
    if ($tests.Length -gt 0) {
        AssertEq 'First test id' $tests[0].id $script:testId
        Write-Host "  [OK] Eligible admin sees test with ID $($tests[0].id)" -ForegroundColor Green
    }
}

Step 'Wrong role gets 403' {
    # Admin should not be able to call officer endpoint
    try {
        SafeApiPost '/api/students/some-id/approve' @{ status = 'verified' }
        Write-Host "  [FAIL] Expected 403, got 200" -ForegroundColor Red
        exit 1
    } catch {
        AssertEq 'Admin calling officer endpoint' $_.Exception.Response.StatusCode.value__ 403
    }
}

Step 'Anonymous gets 401' {
    # Logout to clear session
    SafeApiPost '/api/auth/logout' @{}

    try {
        SafeApiGet '/api/tests'
        Write-Host "  [FAIL] Expected 401, got 200" -ForegroundColor Red
        exit 1
    } catch {
        AssertEq 'Anonymous test list' $_.Exception.Response.StatusCode.value__ 401
    }
}

Step 'Other company admin gets 404 on test detail' {
    # Create another company and login as their admin
    $otherReg = SafeApiPost '/api/auth/register-company' @{
        name = "OtherCo $suffix"
        domain = "oc$suffix.demo"
        contactEmail = "admin@oc$suffix.demo"
        password = 'Password123!'
    }
    $finalLogin = SafeApiPost '/api/auth/login' @{
        email = "admin@oc$suffix.demo"
        password = 'Password123!'
    }
    AssertEq 'Final co login' $finalLogin.StatusDescription 'OK'

    try {
        SafeApiGet "/api/tests/$($script:testId)"
        Write-Host "  [FAIL] Expected 404, got 200" -ForegroundColor Red
        exit 1
    } catch {
        AssertEq 'Other company admin access' $_.Exception.Response.StatusCode.value__ 404
        Write-Host "  [OK] Other company admin gets 404" -ForegroundColor Green
    }
}

Write-Host "`n=== ALL STEPS PASSED ===" -ForegroundColor Green
