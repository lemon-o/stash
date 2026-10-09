; Stash 定制版 · Windows 安装包脚本
; 由 打包stash.py 回填 MyAppVersion 后调用 ISCC.exe 编译，产物落在 dist\ 与桌面。
; 输入为打包暂存目录 dist\package\：StashCustom.exe + _internal + server + ui\build
; 文件需以 UTF-8 BOM 保存，否则中文会被 Inno Setup 当作 ANSI 解析。

#define MyAppName "Stash 定制版"
#define MyAppPublisher "lemon-o"
#define MyAppURL "https://github.com/lemon-o/stash"
#define MyAppExeName "StashCustom.exe"
#define MyAppVersion "0.0.0"
#define StageDir "..\dist\package"

[Setup]
AppId={{8C4A52F7-B1D9-4E33-9C40-5A7E2F0D6B17}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\StashCustom
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
OutputDir=..\dist
OutputBaseFilename=StashCustom-Setup-{#MyAppVersion}
SetupIconFile=..\dist\StashCustom.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
LicenseFile=..\..\LICENSE
ShowLanguageDialog=no

[Languages]
Name: "zh"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#StageDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\_internal\*"; DestDir: "{app}\_internal"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\ui\build\*"; DestDir: "{app}\ui\build"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 只清安装期产生的日志；媒体库与配置在 %LOCALAPPDATA%\StashCustom 下，卸载保留
Type: files; Name: "{localappdata}\StashCustom\desktop.log"
Type: files; Name: "{app}\server\*.log"
