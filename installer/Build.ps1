#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$extension = Join-Path $project 'pantalla-letras.js'
$line = Get-Content -LiteralPath $extension -TotalCount 2 | Select-Object -Last 1
if ($line -notmatch '^// VERSION: (\d+\.\d+\.\d+)$') { throw 'Extension version is missing.' }
$version = $Matches[1]
$dist = Join-Path $project 'dist'
$output = Join-Path $dist "Letras-en-pantalla-$version-Setup.exe"

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.8 is required to build.' }

New-Item -ItemType Directory -Path $dist -Force | Out-Null
$stamp = Join-Path ([IO.Path]::GetTempPath()) ('lep-version-' + [guid]::NewGuid().ToString('N') + '.cs')
try {
    @"
using System.Reflection;
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
"@ | Set-Content -LiteralPath $stamp -Encoding Ascii
    & $compiler /nologo /target:winexe /optimize+ /platform:anycpu /codepage:65001 `
        /reference:System.Windows.Forms.dll /reference:System.Drawing.dll `
        /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll `
        "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')" "/out:$output" `
        "/resource:$extension,extension.js" "/resource:$(Join-Path $project 'LICENSE'),license.txt" `
        (Join-Path $PSScriptRoot 'InstallEngine.cs') (Join-Path $PSScriptRoot 'InstallerWindow.cs') $stamp
    if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
} finally {
    Remove-Item -LiteralPath $stamp -ErrorAction SilentlyContinue
}
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $output)" | Set-Content -LiteralPath "$output.sha256" -Encoding Ascii
Get-Item -LiteralPath $output, "$output.sha256"
