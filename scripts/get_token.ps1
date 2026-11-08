$companyId = $args[0]
$sql = "SELECT token FROM company_verification_tokens WHERE ""companyId"" = '$companyId' LIMIT 1;"
$tmpFile = "$env:TEMP\q_$companyId.sql"
[System.IO.File]::WriteAllText($tmpFile, $sql, [System.Text.UTF8Encoding]::new($false))
docker cp $tmpFile infra-db-1:/tmp/q.sql 2>$null | Out-Null
$result = docker exec infra-db-1 psql -U signal -d signal --no-align --tuples-only -f /tmp/q.sql 2>&1
Remove-Item $tmpFile -ErrorAction SilentlyContinue
Write-Output $result
