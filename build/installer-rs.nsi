; AOURA 启动器 安装程序（拥抱世界 28.0.1 · Rust 原生版）· 由珉爱制作
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "AOURA启动器"
OutFile "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/dist/AOURA启动器-Setup-28.0.1.exe"
InstallDir "$LOCALAPPDATA\AOURA启动器"
InstallDirRegKey HKCU "Software\AOURA启动器" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define APPNAME "AOURA启动器"
!define APPVERSION "28.0.1"
!define MUI_ICON "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/assets/icon.ico"
!define MUI_UNICON "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/assets/icon.ico"
!define MUI_ABORTWARNING
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/build/installer-header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 AOURA 启动器 拥抱世界 28.0.1"
!define MUI_WELCOMEPAGE_TEXT "每一次启动，都是一场光的旅行。\r\n\r\n本次安装为「拥抱世界」系列 Rust 原生重构版：核心引擎全面 Rust 化，Windows 原生直跑、鸿蒙 PC 自动沙箱，跨平台共用同一引擎。\r\n\r\n由珉爱制作，完全免费开源。"
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "AOURA 启动器 拥抱世界 28.0.1 已安装完成。\r\n感谢选择 AOURA —— 每一次启动，都是一场光的旅行。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\AOURA启动器.exe"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 AOURA 启动器"
!define MUI_BRANDINGTEXT "AOURA 启动器 28.0.1 · 由珉爱制作"
VIProductVersion "28.0.1.0"
VIAddVersionKey /LANG=2052 "ProductName" "AOURA启动器"
VIAddVersionKey /LANG=2052 "FileDescription" "AOURA 启动器 - 拥抱世界 Rust 原生版"
VIAddVersionKey /LANG=2052 "FileVersion" "28.0.1"
VIAddVersionKey /LANG=2052 "ProductVersion" "28.0.1"
VIAddVersionKey /LANG=2052 "CompanyName" "珉爱"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright © 珉爱"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "安装" SEC_APP
  SetOutPath "$INSTDIR"
  File "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/aoura-rs/target/x86_64-pc-windows-gnu/release/AOURA启动器.exe"
  File "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/aoura-rs/README.md"
  WriteUninstaller "$INSTDIR\卸载 AOURA启动器.exe"

  CreateDirectory "$SMPROGRAMS\AOURA启动器"
  CreateShortcut "$SMPROGRAMS\AOURA启动器\AOURA启动器.lnk" "$INSTDIR\AOURA启动器.exe"
  CreateShortcut "$DESKTOP\AOURA启动器.lnk" "$INSTDIR\AOURA启动器.exe"

  WriteRegStr HKCU "Software\AOURA启动器" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "DisplayName" "AOURA启动器"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "DisplayVersion" "28.0.1"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "Publisher" "珉爱"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "DisplayIcon" "$INSTDIR\AOURA启动器.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "UninstallString" '"$INSTDIR\卸载 AOURA启动器.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "InstallLocation" "$INSTDIR"
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\AOURA启动器.lnk"
  RMDir /r "$SMPROGRAMS\AOURA启动器"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器"
  DeleteRegKey HKCU "Software\AOURA启动器"
SectionEnd
