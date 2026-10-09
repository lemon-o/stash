; Stash · Windows 安装包脚本
;
; 由 打包stash.py 回填 MyAppVersion 后调用 ISCC.exe 编译，产物落在 dist\ 与桌面。
; 输入为打包暂存目录 dist\package\：stash.exe + ui\build + LICENSE
;
; 交付形态与上游一致（和 Sunshine 同一种）：引擎常驻系统托盘 + 用默认浏览器打开界面。
; 因此这里只装 Go 引擎本体与定制前端，没有任何 Python / Qt / WebView 运行时。
;
; 前端为什么要单独随包：ui 是用 go:embed 编进 stash.exe 的，而本分支不在本地编 Go，
; 于是把 ui\build 一起装到 {app}\ui\build，再通过配置项 ui_location 指过去——
; 这样改前端只需重跑本脚本，不必重编 Go 二进制。
;
; 引擎是 GUI 子系统（打包脚本会把 PE Subsystem 从 console 改成 GUI）：进程不再申请控制台，
; 既没有黑框闪一下，也不会被 Windows Terminal 的「默认终端应用」交接坑到——那会报一条
; [error 2147942632 (0x800700e8) when launching "stash.exe" -c ...]，而程序其实根本没起来。
; 代价是 stdout 无处可写，日志改由 {localappdata}\Stash\stash.log 承载（见文件末段 Code 区块）。
;
; 文件需以 UTF-8 BOM 保存，否则中文会被 Inno Setup 当作 ANSI 解析。

#define MyAppName "Stash"
#define MyAppPublisher "lemon-o"
#define MyAppURL "https://github.com/lemon-o/stash"
#define MyAppExeName "stash.exe"
#define MyAppVersion "1.1.5"
#define StageDir "..\dist\package"
#define DataDir "{localappdata}\Stash"

; 编译期兜底：前端产物必须已经在暂存目录里。少了它，装出来的程序会因为 ui_location
; 指到空目录而启动即 panic（引擎拿它当 statigz 根目录，构造时直接 Open(".") 失败）。
#if !FileExists(AddBackslash(SourcePath) + "..\dist\package\ui\build\index.html")
  #error Missing dist\package\ui\build\index.html - run 打包stash.py first
#endif

[Setup]
; 全新 AppId：上一代是基于 PyInstaller 的 Python 套壳包，用的是另一个 AppId，
; 两者互不覆盖，所以要先手动卸载那一版（顺便把 C:\Program Files\StashCustom 那 500MB
; Qt 运行时一并清掉）再装本版。
AppId={{9F3C1A64-2D7B-4E18-8A55-6C1E7B0D3F92}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\Stash
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; 按用户安装：全程不弹 UAC。脚本还会写 {localappdata} 与 HKCU（预置配置、开机自启），
; 用 admin 装到 Program Files 时这两处会落到「提权用的那个管理员账户」名下，
; 标准用户启动时读不到配置 → 退回内嵌旧前端、也不开浏览器。装用户目录就没这问题。
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\dist
OutputBaseFilename=Stash-Setup-{#MyAppVersion}
SetupIconFile=..\ui\v2.5\public\favicon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/max
; 打开安装日志：Code 段里的 Log() 才会落到 %TEMP%\Setup Log *.txt，出问题时可以直接看
SetupLogging=yes
SolidCompression=yes
WizardStyle=modern
LicenseFile=..\LICENSE
ShowLanguageDialog=no
; 覆盖升级时由安装器先关掉正在跑的托盘程序，但不要装完自动再拉起
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "zh"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "开机自动启动 Stash（常驻系统托盘）"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#StageDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\ui\build\*"; DestDir: "{app}\ui\build"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; 程序目录随时可能被覆盖重装，配置与数据统一放用户目录，升级不会动它
; -c 显式指定配置文件：引擎默认只认「当前工作目录下的 config.yml」和 ~\.stash\config.yml
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "-c ""{#DataDir}\config.yml"""; WorkingDir: "{app}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Parameters: "-c ""{#DataDir}\config.yml"""; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Stash"; ValueData: """{app}\{#MyAppExeName}"" -c ""{#DataDir}\config.yml"""; Tasks: autostart; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Parameters: "-c ""{#DataDir}\config.yml"""; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
{ 预置最小可用配置，并保证引擎需要的目录已经就位。

  三个必填键：
    ui_location —— 指向随包的定制前端。引擎是 statigz.FileServer(osFS(dir))，构造时直接对
                   目录 Open(".")，指到不存在的目录就 panic 秒退（实测退出码 1，在 Windows
                   上表现为「双击没反应」）。所以这里先确认 index.html 真在，不在就干脆不写
                   这个键，让引擎退回内嵌前端。
    nobrowser   —— 引擎对"已存在配置文件"的系统会默认改成 true（那是为老用户保留旧行为），
                   必须显式写 false，否则不会自动打开浏览器。
    database    —— 启动校验必填。generated / metadata / cache / blobs 同样必填，而且一旦写进
                   config，引擎就当成 override、不再自建（manager.go 里的 HasOverride 分支），
                   所以这些目录必须由安装器建好，否则启动时会刷一串
                   could not create ... directory 警告，缩略图 / 雪碧图 / 标记全部失效。
  logfile      —— 引擎已改成 GUI 子系统（没有控制台窗口），stdout 无处可写，
                   日志统一落到 LOCALAPPDATA\Stash\stash.log，上限 1MB。
  路径一律用正斜杠：既避开 YAML 反斜杠转义，Go 在 Windows 上也照样认。
  已存在 config.yml 时只补目录，绝不覆盖用户设置。
  注：Inno Setup 没有 SaveStringToUTF8File，写 UTF-8 要用数组版
  SaveStringsToUTF8File（用户目录含中文时，ANSI 写入会毁掉路径）。 }
procedure EnsureDataDirs();
var
  DataPath: String;
begin
  DataPath := ExpandConstant('{#DataDir}');
  ForceDirectories(DataPath);
  ForceDirectories(DataPath + '\generated');
  ForceDirectories(DataPath + '\metadata');
  ForceDirectories(DataPath + '\cache');
  ForceDirectories(DataPath + '\blobs');
end;

procedure SeedConfig();
var
  DataPath, CfgFile, AppUI, PosixData: String;
  Lines: TArrayOfString;
  n: Integer;
begin
  EnsureDataDirs();
  DataPath := ExpandConstant('{#DataDir}');
  CfgFile := DataPath + '\config.yml';
  if FileExists(CfgFile) then
  begin
    Log('config.yml 已存在，保留用户设置（只补齐数据目录）');
    Exit;
  end;

  AppUI := ExpandConstant('{app}\ui\build');
  StringChangeEx(AppUI, '\', '/', True);
  PosixData := DataPath;
  StringChangeEx(PosixData, '\', '/', True);

  SetArrayLength(Lines, 9);
  n := 0;
  if FileExists(ExpandConstant('{app}\ui\build\index.html')) then
  begin
    Lines[n] := 'ui_location: ' + AppUI;
    n := n + 1;
  end
  else
    Log('警告：{app}\ui\build\index.html 不存在，跳过 ui_location（引擎退回内嵌前端）');

  Lines[n] := 'nobrowser: false'; n := n + 1;
  Lines[n] := 'database: ' + PosixData + '/stash-go.sqlite'; n := n + 1;
  Lines[n] := 'generated: ' + PosixData + '/generated'; n := n + 1;
  Lines[n] := 'metadata: ' + PosixData + '/metadata'; n := n + 1;
  Lines[n] := 'cache: ' + PosixData + '/cache'; n := n + 1;
  Lines[n] := 'blobs: ' + PosixData + '/blobs'; n := n + 1;
  Lines[n] := 'logfile: ' + PosixData + '/stash.log'; n := n + 1;
  Lines[n] := 'logfile_max_size: 1'; n := n + 1;
  SetArrayLength(Lines, n);

  SaveStringsToUTF8File(CfgFile, Lines, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    SeedConfig();
end;
