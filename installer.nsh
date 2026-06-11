; Privoo — Windows browser registration
; electron-builder calls !macro customInstall during installation and
; !macro customUnInstall during uninstallation.
; These registry entries make Windows list Privoo in Settings > Default apps.

!macro customInstall
  ; ── ProgID: HTML / web document files ────────────────────────────────────
  WriteRegStr HKCU "Software\Classes\PrivooBrowserHTM" "" "Privoo HTML Document"
  WriteRegStr HKCU "Software\Classes\PrivooBrowserHTM\DefaultIcon" "" "$INSTDIR\Privoo.exe,0"
  WriteRegStr HKCU "Software\Classes\PrivooBrowserHTM\shell\open\command" "" '"$INSTDIR\Privoo.exe" "%1"'

  ; ── ProgID: URL protocol handler ─────────────────────────────────────────
  WriteRegStr HKCU "Software\Classes\PrivooBrowser" "" "Privoo URL"
  WriteRegStr HKCU "Software\Classes\PrivooBrowser" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\PrivooBrowser\DefaultIcon" "" "$INSTDIR\Privoo.exe,0"
  WriteRegStr HKCU "Software\Classes\PrivooBrowser\shell\open\command" "" '"$INSTDIR\Privoo.exe" "%1"'

  ; ── StartMenuInternet entry ───────────────────────────────────────────────
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo" "" "Privoo"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\DefaultIcon" "" "$INSTDIR\Privoo.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\shell\open\command" "" '"$INSTDIR\Privoo.exe"'

  ; ── Capabilities block ────────────────────────────────────────────────────
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities" "ApplicationDescription" "Private, fast browsing with built-in ad blocking and tracking protection."
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities" "ApplicationIcon" "$INSTDIR\Privoo.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities" "ApplicationName" "Privoo"

  ; ── File associations ─────────────────────────────────────────────────────
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".htm"   "PrivooBrowserHTM"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".html"  "PrivooBrowserHTM"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".shtml" "PrivooBrowserHTM"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".xhtml" "PrivooBrowserHTM"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".xht"   "PrivooBrowserHTM"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".webp"  "PrivooBrowserHTM"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".svg"   "PrivooBrowserHTM"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\FileAssociations" ".pdf"   "PrivooBrowserHTM"

  ; ── URL associations ──────────────────────────────────────────────────────
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\URLAssociations" "http"   "PrivooBrowser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\URLAssociations" "https"  "PrivooBrowser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\URLAssociations" "ftp"    "PrivooBrowser"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\Privoo\Capabilities\URLAssociations" "mailto" "PrivooBrowser"

  ; ── RegisteredApplications pointer ───────────────────────────────────────
  WriteRegStr HKCU "Software\RegisteredApplications" "Privoo" "Software\Clients\StartMenuInternet\Privoo\Capabilities"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\PrivooBrowserHTM"
  DeleteRegKey HKCU "Software\Classes\PrivooBrowser"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Privoo"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Privoo"
!macroend
