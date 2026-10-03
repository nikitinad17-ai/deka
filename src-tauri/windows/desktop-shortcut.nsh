; Dedicated shortcut, no writes to the original Deka installation.
!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Дека 2.lnk" "$INSTDIR\deka2.exe" "" "$INSTDIR\deka2.exe" 0
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\Дека 2.lnk"
!macroend
