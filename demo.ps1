# Signal Demo Script - Phase 1 acceptance criteria
# Requires: running Postgres on 127.0.0.1:5433, API at http://localhost:3001
# Prerequisite: pnpm --filter @signal/db prisma migrate deploy && pnpm --filter @signal/db prisma db seed

$ErrorActionPreference = 'Stop'
$base   = 'http://localhost:3001'
$step   = 0
$tmpDir = "/tmp/signal_demo"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$script:companyId = $null
$script:testId    = $null

function Step($name, $block) {
    $script:step++
    Write-Host "`n=== STEP $script:step : $name ===" -ForegroundColor Cyan
    try { & $block; Write-Host '[PASS]' -ForegroundColor Green }
    catch { Write-Host "[FAIL] $_" -ForegroundColor Red; exit 1 }
}

function LoginUser($email, $password, $tokenVarName) {
    $bodyFile = "$tmpDir\body.json"
    @{ email = $email; password = $password } | ConvertTo-Json -Compress | Out-File -FilePath $bodyFile -Encoding utf8
    # Use -c with a unique jar per user, then extract the token value manually
    $jarFile = "$tmpDir\jar_${tokenVarName}.txt"
    if (Test-Path $jarFile) { Remove-Item $jarFile }
    curl.exe -s -X POST "$base/api/auth/login" -H 'Content-Type: application/json' `
        -c $jarFile --data-binary "@$bodyFile" > $null
    # Extract token from cookie file (last field)
    if (Test-Path $jarFile) {
        $line = Get-Content $jarFile | Where-Object { $_ -match '^#\s*\S+\s+token\s+' -or $_ -match '\ttoken\t' }
        if ($line) {
            $tokens = $line -split "`t"
            if ($tokens.Count -ge 7) { Set-Variable -Name $tokenVarName -Value $tokens[6] -Scope Script }
        }
    }
}

function ApiPost($path, $token, $bodyObj) {
    $bodyFile = "$tmpDir\body.json"
    $bodyObj | ConvertTo-Json -Compress | Out-File -FilePath $bodyFile -Encoding utf8
    $resp = curl.exe -s -X POST "$base$path" -H 'Content-Type: application/json' `
        -H "Cookie: token=$token" --data-binary "@$bodyFile"
    return $resp | ConvertFrom-Json
}

function ApiGet($path, $token) {
    $resp = curl.exe -s -X GET "$base$path" -H "Cookie: token=$token"
    return $resp | ConvertFrom-Json
}

function Run-Sql($sql) {
    $file = "$env:TEMP\signal_sql_$pid.sql"
    [System.IO.File]::WriteAllText($file, $sql, [System.Text.UTF8Encoding]::new($false))
    Get-Content $file | docker exec -i infra-db-1 psql -U signal -d signal 2>$null | Out-Null
    Remove-Item $file -Force -ErrorAction SilentlyContinue
}

function Get-Token($companyId) {
    $sql = "SELECT token FROM company_verification_tokens WHERE ""companyId"" = '$companyId' LIMIT 1;"
    $file = "$env:TEMP\signal_tok_$pid.sql"
    [System.IO.File]::WriteAllText($file, $sql, [System.Text.UTF8Encoding]::new($false))
    $result = Get-Content $file | docker exec -i infra-db-1 psql -U signal -d signal -tA 2>&1
    Remove-Item $file -Force -ErrorAction SilentlyContinue
    return ($result -split "`n" | Where-Object { $_ -match '^[a-z0-9]{20,}$' } | Select-Object -First 1).Trim()
}

# Cleanup leftover state from previous runs
$domain = 'democorp.demo'
Run-Sql @"
DELETE FROM company_verification_tokens WHERE "companyId" IN (SELECT id FROM companies WHERE domain = '$domain');
DELETE FROM company_members WHERE "companyId" IN (SELECT id FROM companies WHERE domain = '$domain');
DELETE FROM users WHERE email = 'ceo@$domain';
DELETE FROM companies WHERE domain = '$domain';
"@
Write-Host '  (cleanup done)' -ForegroundColor Gray

# Create isolated cookie jars for every actor
$jars     = @{}
$credList = @(
    @{ email = 'admin@acme-p1.com';  password = 'password123' },
    @{ email = 'boss@globex-p1.com'; password = 'password123' },
    @{ email = 'off1@tech-p1.edu';   password = 'password123' },
    @{ email = 's1@tech-p1.edu';     password = 'password123' },
    @{ email = 'demo@tech-p1.edu';   password = 'password123' }
)
foreach ($c in $credList) {
    $name  = $c.email -replace '[^a-zA-Z0-9]', '_'
    $jars[$name] = "$tmpDir\jar_$name.txt"
    if (Test-Path $jars[$name]) { Remove-Item $jars[$name] }
    LoginUser $c.email $c.password $jars[$name]
}
Write-Host ("  Pre-login complete for " + $jars.Keys.Count + " identities") -ForegroundColor Gray

# STEP 1: Register a new company
Step 'Register company' {
    $res = ApiPost '/api/auth/register-company' $jars['admin_acme_p1_com'] @{
        name            = 'Demo Corp'
        domain          = 'democorp.demo'
        contactEmail    = 'ceo@democorp.demo'
        password        = 'SecurePass123!'
        industry        = 'Software'
        studentsToHire  = 10
        dataTermsAgreed = $true
    }
    Write-Host ("  Response: id=" + $res.id + " verified=" + $res.verified)
    if ($res.verified -ne $false) { throw ("Expected verified=false, got " + $res.verified) }
    $script:companyId = $res.id
}

# STEP 2: Verify the company via emailed-token link
Step 'Verify company via emailed token link' {
    $tok = Get-Token $script:companyId
    if (-not $tok) { throw 'No verification token found' }
    Write-Host ('  Token: ' + $tok)
    $res = ApiGet ("/api/auth/verify-company?token=" + $tok) $jars['admin_acme_p1_com']
    Write-Host ("  Response: verified=" + $res.verified)
    if ($res.verified -ne $true) { throw 'Expected verified=true' }
}

# STEP 3: Log in as admin of newly-verified company
Step 'Admin login' {
    $newJar = "$tmpDir\jar_ceo_democorp_demo.txt"
    if (Test-Path $newJar) { Remove-Item $newJar }
    LoginUser 'ceo@democorp.demo' 'SecurePass123!' $newJar
    Write-Host '  Logged in as ceo@democorp.demo'
}

# STEP 4: Create a question + draft test
Step 'Create test (draft)' {
    $qRes = ApiPost '/api/questions' $jars['ceo_democorp_demo'] @{
        title             = 'Two Sum'
        difficulty        = 'easy'
        topics            = @('arrays')
        timeLimitSeconds  = 60
        memoryLimitMb     = 256
        description       = 'Find two indices that sum to target'
        inputFormat       = 'array'
        outputFormat      = 'indices'
        constraints       = ''
        mode              = 'stdio'
        allowedLanguages  = @('javascript')
        starterCode       = @{}
        referenceSolution = ''
        customChecker     = ''
    }
    $questionId = $qRes.id
    Write-Host ('  Created question: ' + $questionId)
    $tRes = ApiPost '/api/tests' $jars['ceo_democorp_demo'] @{
        name            = 'Phase1 Demo Test'
        type            = 'coding'
        durationMinutes = 45
        passMark        = 60
        openAt          = '2026-01-01T00:00:00Z'
        closeAt         = '2027-12-31T23:59:59Z'
        audience        = @{ collegeIds = @(); batches = @(2027); branches = @('CSE'); minCgpa = 7.0 }
        questions       = @(@{ questionId = $questionId })
    }
    $script:testId = $tRes.id
    Write-Host ("  Created test (draft): " + $tRes.name + " id=" + $tRes.id)
}

# STEP 5: Ineligible student (pending status) gets 404
Step 'Ineligible student (pending) gets 404 on test detail' {
    $errCaught = $false
    try {
        curl.exe -s -f -X GET "$base/api/tests/$script:testId" -b $jars['s1_tech_p1_edu'] > $null 2>&1
    } catch {
        if ($_.Exception.Message -match '404') { Write-Host '  Got expected 404 for pending/unapproved student'; $errCaught = $true } else { throw }
    }
    if (-not $errCaught) { throw 'Expected 404 but got success' }
}

# STEP 6: Officer approves own-college student
Step 'Officer approves own-college student' {
    $stuList = ApiGet '/api/students?status=pending' $jars['off1_tech_p1_edu']
    $pending = $stuList | Where-Object { $_.collegeEmail -like '*tech-p1*' } | Select-Object -First 1
    if (-not $pending) {
        Write-Host '  (no pending tech-p1 student; registering one now)'
        $regRes = ApiPost '/api/students/register' $jars['off1_tech_p1_edu'] @{
            name         = 'Demo Student'
            batchYear    = 2027
            branch       = 'CSE'
            cgpa         = 8.0
            rollNo       = 'DEM01'
            collegeEmail = 'demo@tech-p1.edu'
            password     = 'password123'
        }
        $pending = $regRes
    }
    Write-Host ("  Student to approve: " + $pending.id + " (" + $pending.collegeEmail + ")")
    $aprRes = ApiPost ("/api/students/" + $pending.id + "/approve") $jars['off1_tech_p1_edu'] $null
    Write-Host ("  Approved: success=" + $aprRes.success)
}

# STEP 7: Eligible (now-approved) student sees test -> 200
Step 'Eligible student sees eligible test -> 200' {
    LoginUser 'demo@tech-p1.edu' 'password123' $jars['demo_tech_p1_edu']
    $tests = ApiGet '/api/tests' $jars['demo_tech_p1_edu']
    Write-Host ("  Tests visible to eligible student: " + $tests.Count)
    if ($tests.Count -eq 0) { throw 'Expected at least 1 eligible test' }
    $found = $tests | Where-Object { $_.id -eq $script:testId }
    if (-not $found) { throw 'Test not found in eligible list' }
    Write-Host ('  Found test in eligible list: ' + $found.name)
}

# STEP 8: Wrong role (student) tries admin-only route -> 403
Step 'Wrong role (student) tries admin route -> 403' {
    $errCaught = $false
    try {
        $bpBody = '{"name":"Hijack","domain":"hijack.test","contactEmail":"x@hijack.test","password":"x"}'
        $bodyFile = "$tmpDir\bp_body.json"
        [System.IO.File]::WriteAllText($bodyFile, $bpBody)
        curl.exe -s -f -X POST "$base/api/tests" -H 'Content-Type: application/json' `
            -b $jars['demo_tech_p1_edu'] --data-binary "@$bodyFile" > $null 2>&1
    } catch {
        if ($_.Exception.Message -match '403') { Write-Host '  Got expected 403 - student cannot create tests'; $errCaught = $true } else { throw }
    }
    if (-not $errCaught) { throw 'Expected 403 but got success' }
}

# STEP 9: Anonymous access -> 401
Step 'Anonymous access -> 401' {
    $anonJar = "$tmpDir\jar_anon.txt"
    if (Test-Path $anonJar) { Remove-Item $anonJar }
    $errCaught = $false
    try {
        curl.exe -s -f -X GET "$base/api/tests" -b $anonJar > $null 2>&1
    } catch {
        if ($_.Exception.Message -match '401') { Write-Host '  Got expected 401 - no auth header/cookie'; $errCaught = $true } else { throw }
    }
    if (-not $errCaught) { throw 'Expected 401 but got success' }
}

# STEP 10: Other company admin can't see another company's test -> 404
Step 'Other-company admin gets 404 on another company test' {
    $errCaught = $false
    try {
        curl.exe -s -f -X GET "$base/api/tests/$script:testId" -b $jars['boss_globex_p1_com'] > $null 2>&1
    } catch {
        if ($_.Exception.Message -match '404') { Write-Host '  Got expected 404 - cross-company tests hidden'; $errCaught = $true } else { throw }
    }
    if (-not $errCaught) { throw 'Expected 404 but got success' }
}

# Cleanup temp files
Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host ' All 10 demo steps passed.' -ForegroundColor Green
Write-Host ' Phase 1 core flows working end-to-end.' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green