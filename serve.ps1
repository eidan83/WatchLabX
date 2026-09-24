Set-Location $PSScriptRoot
$port = 8774
Write-Host "WatchLabX v0.2.0 Mobile Sessions -> http://localhost:$port/?v=0.2.0"
Start-Process "http://localhost:$port/?v=0.2.0"
if (Get-Command py -ErrorAction SilentlyContinue) {
  py -m http.server $port --bind 127.0.0.1
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  python -m http.server $port --bind 127.0.0.1
} else {
  Write-Host "Python 3 was not found."
}
