# Reproducible, disposable integration test. Never links to a remote project.
# Run in a separate PowerShell process. CLI output contains local credentials and
# is deliberately captured, never printed. No .env file is read or written.
param([switch]$SimulateTestFailure)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repoRoot = Split-Path -Parent $PSScriptRoot
# CLI truncates long project IDs. Keep the entire identifier below 40 chars so
# container identity checks and cleanup always address exactly the same stack.
$pilotProject = 'PriceAIPilot' + [guid]::NewGuid().ToString('N').Substring(0,16)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\', '/')
$pilotRoot = Join-Path $tempRoot $pilotProject
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($pilotRoot)) -ne $tempRoot) { throw 'Unsafe pilot directory.' }
$started = $false

function Invoke-PilotCli([string[]]$CliArguments) {
    $captured = & npx.cmd --yes supabase@2.117.0 @CliArguments --workdir $pilotRoot --yes 2>&1
    if ($LASTEXITCODE -ne 0) {
        $safeClasses = @('unhealthy','port is already allocated','address already in use','context deadline exceeded','connection refused','permission denied','SQLSTATE','failed to start','failed to pull','timeout','not found')
        foreach ($class in $safeClasses) {
            if (($captured -join "`n").ToLowerInvariant().Contains($class.ToLowerInvariant())) { Write-Output "Local CLI failure class: $class" }
        }
        throw "Local pilot CLI failed: $($CliArguments[0]). Output withheld for credential safety."
    }
    return $captured
}

try {
    New-Item -ItemType Directory -Path (Join-Path $pilotRoot 'supabase') | Out-Null
    # Copy only audited source files: never .temp, remote link state, or env files.
    Copy-Item -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -Destination (Join-Path $pilotRoot 'supabase/migrations') -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'supabase/seed.sql') -Destination (Join-Path $pilotRoot 'supabase/seed.sql')
    $config = Get-Content -LiteralPath (Join-Path $repoRoot 'supabase/config.toml') -Raw
    $config = $config -replace '(?m)^project_id = .*$', ('project_id = "' + $pilotProject + '"')
    foreach ($ports in @(@(54321,55421),@(54322,55422),@(54320,55420),@(54323,55423),@(54324,55424),@(54329,55429))) {
        $config = $config -replace "(?m)^(port|shadow_port) = $($ports[0])\s*$", "`$1 = $($ports[1])"
    }
    [IO.File]::WriteAllText((Join-Path $pilotRoot 'supabase/config.toml'), $config)
    $started = $true # Also clean partial starts.
    $null = Invoke-PilotCli @('start','--exclude','logflare,vector,edge-runtime')
    Write-Output 'Isolated local stack started; migrations and seed applied.'
    $statusOutput = & npx.cmd --yes supabase@2.117.0 status --workdir $pilotRoot -o json 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Local status failed.' }
    $status = ($statusOutput -join "`n") | ConvertFrom-Json
    if ($status.API_URL -ne 'http://127.0.0.1:55421') { throw 'Unexpected pilot endpoint.' }
    $env:PRICEAI_LOCAL_MIRROR_PILOT = '1'
    $env:PRICEAI_LOCAL_MIRROR_PILOT_PROJECT = $pilotProject
    $env:NEXT_PUBLIC_SUPABASE_URL = $status.API_URL
    $env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
    $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $status.ANON_KEY
    if ($SimulateTestFailure) { throw 'Intentional test failure for cleanup verification.' }
    Push-Location $repoRoot
    try {
        $testOutput = & npm.cmd test -- src/lib/catalog-images/local-mirror-pilot.integration.test.ts 2>&1
        # Only expose fixed checkpoints and source line locations, never errors/data.
        foreach ($line in $testOutput) {
            if ("$line" -match 'PILOT_STAGE:([a-z_]+)') { Write-Output "Pilot stage: $($Matches[1])" }
            if ("$line" -match 'local-mirror-pilot\.integration\.test\.ts:(\d+):\d+') { Write-Output "Pilot test location: line $($Matches[1])" }
        }
        if ($LASTEXITCODE -ne 0) { throw 'Local integration test failed; raw output withheld.' }
        Write-Output 'Local integration test passed (1 test).'
    } finally { Pop-Location }
} finally {
    # Append-only audit records are preserved by policy: destroy only this newly
    # generated stack, not individual rows, and never the shared PriceAI stack.
    if ($started) {
        $null = Invoke-PilotCli @('stop','--no-backup','--project-id',$pilotProject)
        $remaining = & docker ps -a --filter "label=com.supabase.cli.project=$pilotProject" --format '{{.Names}}' 2>$null
        if ($LASTEXITCODE -ne 0 -or $remaining) { throw 'Pilot container cleanup could not be confirmed.' }
        $volumes = & docker volume ls --filter "label=com.supabase.cli.project=$pilotProject" --format '{{.Name}}' 2>$null
        if ($LASTEXITCODE -ne 0 -or $volumes) { throw 'Pilot volume cleanup could not be confirmed.' }
    }
    if (Test-Path -LiteralPath $pilotRoot) {
        $resolved = (Resolve-Path -LiteralPath $pilotRoot).Path
        if ($resolved -ne [IO.Path]::GetFullPath($pilotRoot) -or [IO.Path]::GetDirectoryName($resolved) -ne $tempRoot) { throw 'Unsafe cleanup target.' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    Write-Output 'Isolated pilot containers, volumes, test records, objects and temporary directory removed.'
}
