[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9_.-]+$')]
    [string]$Name,

    [switch]$FromClipboard,
    [switch]$FromStandardInput,
    [switch]$Verify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$vaultDirectory = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.secrets-local'))

if (-not $vaultDirectory.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to write outside the AJ Luxury project.'
}

$targetPath = Join-Path $vaultDirectory ($Name + '.dpapi')

if ($FromClipboard -and $FromStandardInput) {
    throw 'Choose only one secret input source.'
}

if ($FromClipboard -or $FromStandardInput) {
    $plainText = if ($FromStandardInput) {
        [Console]::In.ReadToEnd()
    }
    else {
        [string](Get-Clipboard -Raw)
    }
    $plainText = $plainText.Trim()

    if ([string]::IsNullOrWhiteSpace($plainText)) {
        throw 'The clipboard is empty.'
    }

    New-Item -ItemType Directory -Path $vaultDirectory -Force | Out-Null
    $secureValue = ConvertTo-SecureString -String $plainText -AsPlainText -Force
    $encryptedValue = ConvertFrom-SecureString -SecureString $secureValue
    [System.IO.File]::WriteAllText(
        $targetPath,
        $encryptedValue,
        [System.Text.UTF8Encoding]::new($false)
    )

    if ($FromClipboard) {
        Set-Clipboard -Value ''
    }
    $plainText = $null
    $secureValue = $null
    $encryptedValue = $null
}

if ($Verify) {
    if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        throw "No encrypted secret exists for '$Name'."
    }

    $encryptedValue = [System.IO.File]::ReadAllText($targetPath)
    $secureValue = ConvertTo-SecureString -String $encryptedValue
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)

    try {
        $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        [pscustomobject]@{
            Name = $Name
            Encrypted = $true
            DecryptableByCurrentWindowsUser = $true
            ValueLength = $plainText.Length
            Prefix = if ($plainText.Length -ge 3) { $plainText.Substring(0, 3) } else { '' }
        } | ConvertTo-Json -Compress
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $plainText = $null
        $secureValue = $null
        $encryptedValue = $null
    }
}
