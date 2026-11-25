; Extra installer steps (included by electron-builder's NSIS installer).
; Version 1.0 used a hand-made installer with its own entry in "Installed apps". Remove that old entry so the app
; is listed once. The files themselves are in the same folder and are replaced by this install.
!macro customInstall
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LevelUpLife"
  DeleteRegKey HKCU "Software\LevelUpLife"
!macroend
