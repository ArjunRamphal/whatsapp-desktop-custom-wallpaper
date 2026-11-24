# WhatsApp Desktop custom wallpaper - installer
# Copies a small browser extension + your image(s) to %LOCALAPPDATA%\WhatsAppWallpaper and
# tells WhatsApp's embedded browser (WebView2) to load it. Run again to change or add wallpapers.
param(
    [string]$Image,   # optional: image path, skips the file picker
    [string]$Contact  # optional: contact/group name for a per-chat wallpaper (or '*' for all chats)
)

$ErrorActionPreference = 'Stop'
$ExtDir    = Join-Path $env:LOCALAPPDATA 'WhatsAppWallpaper'
$RegKey    = 'HKCU:\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$ValueName = 'WhatsApp.Root.exe'
$Flag      = "--load-extension=`"$ExtDir`""

function Finish([int]$code) {
    Write-Host ''
    Read-Host 'Press Enter to close' | Out-Null
    exit $code
}

function Pick-ImageFile {
    Add-Type -AssemblyName System.Windows.Forms
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.Title  = 'Choose your WhatsApp wallpaper'
    $dlg.Filter = 'Images|*.jpg;*.jpeg;*.png;*.webp;*.gif;*.bmp|All files|*.*'
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        return $null
    }
    return $dlg.FileName
}

function Get-SafeContactFilename([string]$name, [string]$sourcePath) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($name)
        $hashBytes = $sha.ComputeHash($bytes)
        $hex = -join ($hashBytes[0..7] | ForEach-Object { $_.ToString('x2') })
    } finally {
        $sha.Dispose()
    }
    $ext = [System.IO.Path]::GetExtension($sourcePath)
    if (-not $ext) { $ext = '.jpg' }
    return "contact-$hex$ext"
}

function Read-WallpaperConfig([string]$configPath) {
    $cfg = @{
        default  = $null
        contacts = @{}
    }
    if (-not (Test-Path $configPath)) { return $cfg }
    try {
        $raw = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($raw.default) { $cfg.default = [string]$raw.default }
        if ($raw.contacts) {
            foreach ($prop in $raw.contacts.PSObject.Properties) {
                $cfg.contacts[$prop.Name] = [string]$prop.Value
            }
        }
    } catch {
        # Start fresh if config.json is malformed
    }
    return $cfg
}

# Writing under HKCU\Software\Policies needs admin, so relaunch this script elevated
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    if ($Image) { $argList += @('-Image', "`"$Image`"") }
    if ($Contact) { $argList += @('-Contact', "`"$Contact`"") }
    try {
        Start-Process powershell -Verb RunAs -ArgumentList $argList
    } catch {
        Write-Host 'Administrator permission was declined, nothing changed.' -ForegroundColor Red
        Finish 1
    }
    exit 0
}

Write-Host ''
Write-Host '=== WhatsApp Desktop custom wallpaper ===' -ForegroundColor Cyan

$pkg = Get-AppxPackage 5319275A.WhatsAppDesktop
if (-not $pkg) {
    Write-Host 'WhatsApp Desktop (Microsoft Store version) was not found on this PC.' -ForegroundColor Red
    Write-Host 'Install it from the Microsoft Store first, then run this again.'
    Finish 1
}

# 1. Decide whether to set a global wallpaper, a per-contact wallpaper, or skip image selection
$mode = 'all'
if ($Contact -and $Contact -ne '*') {
    $mode = 'contact'
} elseif (-not $Image -and -not $Contact) {
    Write-Host ''
    Write-Host 'Choose wallpaper mode:'
    Write-Host '  [1] All chats (default wallpaper)'
    Write-Host '  [2] A specific contact or group'
    Write-Host '  [3] Install extension only (choose wallpapers inside WhatsApp)'
    $choice = (Read-Host 'Enter 1, 2, or 3 [1]').Trim()
    if ($choice -eq '2') {
        $mode = 'contact'
        $Contact = (Read-Host 'Enter exact contact or group name (as shown in chat header)').Trim()
        if (-not $Contact) {
            Write-Host 'No contact name entered, nothing changed.'
            Finish 1
        }
    } elseif ($choice -eq '3') {
        $mode = 'none'
    }
}

if ($mode -ne 'none') {
    if (-not $Image) {
        $Image = Pick-ImageFile
        if (-not $Image) {
            Write-Host 'No image chosen, nothing changed.'
            Finish 1
        }
    }
    if (-not (Test-Path $Image)) {
        Write-Host "Image not found: $Image" -ForegroundColor Red
        Finish 1
    }
}

# 2. Copy the extension, image(s), and update config.json
New-Item -ItemType Directory -Force $ExtDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'extension\*') $ExtDir -Force

$configPath = Join-Path $ExtDir 'config.json'
$cfg = Read-WallpaperConfig $configPath

if ($mode -eq 'all') {
    Copy-Item $Image (Join-Path $ExtDir 'wallpaper.jpg') -Force
    $cfg.default = 'wallpaper.jpg'
    Write-Host "Copied default wallpaper and extension to $ExtDir"
} elseif ($mode -eq 'contact') {
    $wallpapersDir = Join-Path $ExtDir 'wallpapers'
    New-Item -ItemType Directory -Force $wallpapersDir | Out-Null
    $fileName = Get-SafeContactFilename $Contact $Image
    Copy-Item $Image (Join-Path $wallpapersDir $fileName) -Force
    $cfg.contacts[$Contact] = "wallpapers/$fileName"
    Write-Host "Saved wallpaper for '$Contact' in $ExtDir"
} else {
    Write-Host "Copied extension to $ExtDir (you can set per-chat wallpapers inside WhatsApp)"
}

$json = $cfg | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($configPath, $json, [System.Text.UTF8Encoding]::new($false))

# 3. Register the extension with WhatsApp, keeping any other arguments already set
if (-not (Test-Path $RegKey)) { New-Item $RegKey -Force | Out-Null }
$current = (Get-ItemProperty $RegKey -Name $ValueName -ErrorAction SilentlyContinue).$ValueName
if ($current -and $current.Contains($Flag)) {
    Write-Host 'Extension already registered, configuration updated.'
} else {
    $new = if ($current) { "$current $Flag" } else { $Flag }
    New-ItemProperty $RegKey -Name $ValueName -Value $new -PropertyType String -Force | Out-Null
    Write-Host 'Extension registered.'
}

# 4. Restart WhatsApp so it picks up the change
$running = Get-Process WhatsApp.Root -ErrorAction SilentlyContinue
if ($running) {
    Write-Host 'Restarting WhatsApp...'
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}
Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!App"

Write-Host ''
Write-Host 'Done! Open any chat to see your wallpaper, or click the wallpaper icon in the chat header.' -ForegroundColor Green
Write-Host 'To add/change another contact via script, run Install again. To remove everything, run Uninstall.'
Finish 0
