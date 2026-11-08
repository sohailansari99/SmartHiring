# Cleanup script - delete demo data from database
$domain = 'democorp.demo'
$sql = @"
DELETE FROM company_verification_tokens WHERE "companyId" IN (SELECT id FROM companies WHERE domain = '$domain');
DELETE FROM company_members WHERE "companyId" IN (SELECT id FROM companies WHERE domain = '$domain');
DELETE FROM users WHERE email = 'ceo@$domain';
DELETE FROM companies WHERE domain = '$domain';
"@
$tmpFile = "$env:TEMP\signal_clean.sql"
[System.IO.File]::WriteAllText($tmpFile, $sql, [System.Text.UTF8Encoding]::new($false))
docker cp $tmpFile infra-db-1:/tmp/clean.sql 2>$null | Out-Null
$result = docker exec infra-db-1 psql -U signal -d signal -f /tmp/clean.sql 2>&1
Remove-Item $tmpFile -ErrorAction SilentlyContinue
Write-Output $result
