; Per-user installer. Compile with Inno Setup 6.7+, never stores user data here.
#ifndef Payload
  #error Payload must point to the verified native payload folder
#endif
#ifndef ReleaseOutput
  #error ReleaseOutput is required
#endif
#ifndef BuildVersion
  #define BuildVersion "2026.10.17.1"
#endif
[Setup]
AppId=DecupaViralEngine
AppName=Decupa Viral
AppVersion={#BuildVersion}
AppPublisher=Arthur (DSGNarthur)
AppPublisherURL=https://github.com/DSGNarthur/decupa-viral
DefaultDirName={localappdata}\Programs\Decupa Viral
DefaultGroupName=Decupa Viral
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#ReleaseOutput}
OutputBaseFilename=Decupa-Windows-Setup
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Motor Decupa Viral
LicenseFile={#Payload}\app\LICENSE
CloseApplications=no
RestartApplications=no

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "autostart"; Description: "Iniciar o motor em segundo plano ao entrar no Windows"

[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "DecupaViral"; ValueData: """{app}\python\pythonw.exe"" ""{app}\app\desktop\runtime.py"" --background"; Tasks: autostart; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\decupaviral"; ValueType: string; ValueData: "URL:Decupa Viral"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\decupaviral"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\decupaviral\shell\open\command"; ValueType: string; ValueData: """{app}\python\pythonw.exe"" ""{app}\app\desktop\runtime.py"" --background --protocol ""%1"""

[Icons]
Name: "{group}\Decupa Viral"; Filename: "https://decupa-viral.vercel.app"
Name: "{group}\Encerrar motor"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\app\desktop\stop.py"""
Name: "{group}\Desinstalar motor"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\app\desktop\runtime.py"" --background"; Flags: nowait runhidden
Filename: "https://decupa-viral.vercel.app"; Description: "Abrir o Decupa Viral"; Flags: postinstall shellexec skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
  // Updates must not replace the interpreter while it owns live files/jobs.
  Result := True;
  if FileExists(ExpandConstant('{localappdata}\Programs\Decupa Viral\python\python.exe')) then
  begin
    MsgBox('Uma instalação já existe. Encerre o motor e desinstale apenas o motor antes de instalar. Os vídeos e configurações são preservados em outra pasta.', mbInformation, MB_OK);
    Result := False;
  end;
end;

function InitializeUninstall(): Boolean;
var
  Code: Integer;
begin
  // stop.py refuses active jobs and matches only this installation's processes.
  Result := Exec(ExpandConstant('{app}\python\python.exe'),
    '"' + ExpandConstant('{app}\app\desktop\stop.py') + '"',
    ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Code);
  if Result then Result := Code = 0;
  if not Result then
    MsgBox('Não foi possível encerrar o motor com segurança. Termine ou cancele as tarefas pelo site antes de desinstalar. Os dados não foram removidos.', mbInformation, MB_OK);
end;
