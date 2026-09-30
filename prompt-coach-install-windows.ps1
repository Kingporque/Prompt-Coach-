$ErrorActionPreference = 'Stop'

$repository = 'Kingporque/Prompt-Coach-'
$assetUrl = "https://github.com/$repository/releases/latest/download/prompt-optimizer.zip"
$installDir = Join-Path $env:LOCALAPPDATA 'Prompt Coach\Extension'
$tempZip = Join-Path $env:TEMP 'prompt-optimizer.zip'
$extensionDir = $null

Write-Host 'Choose how to get Prompt Coach:'
Write-Host '  1) Download the latest GitHub release'
Write-Host '  2) Use an extension ZIP or extracted folder already on this computer'
$choice = Read-Host 'Choice [1/2]'

try {
  if ($choice -eq '1') {
    Write-Host 'Downloading the latest Prompt Coach release...'
    Invoke-WebRequest -Uri $assetUrl -OutFile $tempZip
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Expand-Archive -Path $tempZip -DestinationPath $installDir -Force
    $extensionDir = $installDir
  }
  elseif ($choice -eq '2') {
    $sourcePath = Read-Host 'Path to the extension ZIP or extracted folder'
    if (Test-Path -LiteralPath $sourcePath -PathType Container) {
      $extensionDir = (Resolve-Path -LiteralPath $sourcePath).Path
    }
    elseif (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
      New-Item -ItemType Directory -Path $installDir -Force | Out-Null
      Expand-Archive -LiteralPath $sourcePath -DestinationPath $installDir -Force
      $extensionDir = $installDir
    }
    else {
      throw "Could not find: $sourcePath"
    }
  }
  else {
    throw 'Choose 1 or 2.'
  }

  if (-not (Test-Path -LiteralPath (Join-Path $extensionDir 'manifest.json') -PathType Leaf)) {
    throw "No manifest.json found at the top level of $extensionDir. Choose the extracted extension folder, not its parent folder."
  }
}
finally {
  if (Test-Path $tempZip) { Remove-Item $tempZip -Force }
}

$chromePaths = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) {
  Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions'
}
else {
  Write-Host 'Open chrome://extensions in Chrome to finish installation.'
}

Write-Host "`nExtension files are ready at:`n$extensionDir`n"
Write-Host 'In Chrome, enable Developer mode, choose Load unpacked, and select the folder above.'
Write-Host 'Chrome requires this final step for extensions installed outside the Web Store.'
