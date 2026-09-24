; AOURA 启动器 安装程序 · 由珉爱制作
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "AOURA启动器"
OutFile "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/dist/AOURA启动器-Setup-18.2.exe"
InstallDir "$LOCALAPPDATA\AOURA启动器"
InstallDirRegKey HKCU "Software\AOURA启动器" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define APPNAME "AOURA启动器"
!define APPVERSION "18.2"
!define MUI_ICON "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/assets/icon.ico"
!define MUI_UNICON "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/assets/icon.ico"
!define MUI_ABORTWARNING
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/build/installer-header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 AOURA 启动器 18.2"
!define MUI_WELCOMEPAGE_TEXT "每一次启动，都是一场光的旅行。\r\n\r\n本安装程序将引导你完成 AOURA 启动器的安装：沉浸光效界面 · 一键启动 Minecraft · 模组 / 光影 / 存档 / 整合包管理 · 陶瓦联机 · 10 套主题。\r\n\r\n由珉爱制作，完全免费开源。"
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "AOURA 启动器 18.2 已安装完成。\r\n感谢选择 AOURA —— 每一次启动，都是一场光的旅行。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\AOURA启动器.exe"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 AOURA 启动器"
!define MUI_BRANDINGTEXT "AOURA 启动器 18.2 · 由珉爱制作"
VIProductVersion "18.2.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "AOURA启动器"
VIAddVersionKey /LANG=2052 "FileDescription" "AOURA 启动器 - 沉浸光效 Minecraft 启动器"
VIAddVersionKey /LANG=2052 "FileVersion" "18.2.0.0"
VIAddVersionKey /LANG=2052 "ProductVersion" "18.2"
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
  File /r "/home/user/Doubao/chats/38443474319103490/aoura-launcher-app/dist/win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\卸载 AOURA启动器.exe"

  CreateDirectory "$SMPROGRAMS\AOURA启动器"
  CreateShortcut "$SMPROGRAMS\AOURA启动器\AOURA启动器.lnk" "$INSTDIR\AOURA启动器.exe"
  CreateShortcut "$DESKTOP\AOURA启动器.lnk" "$INSTDIR\AOURA启动器.exe"

  WriteRegStr HKCU "Software\AOURA启动器" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "DisplayName" "AOURA启动器"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\AOURA启动器" "DisplayVersion" "18.2"
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
