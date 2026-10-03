; Use Tauri's installed filename, which can differ from the Cargo binary name.
!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Дека 2.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\Дека 2.lnk"
!macroend
