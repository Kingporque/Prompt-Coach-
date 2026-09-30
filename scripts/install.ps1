$ErrorActionPreference = 'Stop'

$repository = 'Kingporque/Prompt-Coach-'
$assetUrl = "https://github.com/$repository/releases/latest/download/prompt-optimizer.zip"
$installDir = Join-Path $env:LOCALAPPDATA 'Prompt Coach\Extension'
$tempZip = Join-Path $env:TEMP 'prompt-optimizer.zip'

try {
  Write-Host 'Downloading the latest Prompt Coach release...'
  Invoke-WebRequest -Uri $assetUrl -OutFile $tempZip
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Expand-Archive -Path $tempZip -DestinationPath $installDir -Force
  Write-Host "`nExtension files are installed at:`n$installDir`n"
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

Write-Host 'In Chrome, enable Developer mode, choose Load unpacked, and select the folder above.'
Write-Host 'Chrome requires this final step for extensions installed outside the Web Store.'
