Set objShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = scriptDir

' Check if the server is already running on port 5173
Function IsServerRunning()
    Dim objExec, strOutput
    Set objExec = objShell.Exec("cmd /c netstat -ano 2>nul | findstr :5173")
    strOutput = objExec.StdOut.ReadAll()
    IsServerRunning = (InStr(strOutput, ":5173") > 0)
End Function

' Run the auto-updater check silently (Wait for it to finish)
objShell.Run "cmd /c node scripts\check_updates.cjs", 0, True

' If not running, start it completely hidden in the background
If Not IsServerRunning() Then
    objShell.Run "cmd /c npm run dev", 0, False
    
    ' Wait until server is actually ready (check every 1 second, up to 30 seconds)
    Dim waitCount
    waitCount = 0
    Do While Not IsServerRunning() And waitCount < 30
        WScript.Sleep 1000
        waitCount = waitCount + 1
    Loop
    
    ' Extra buffer for server to fully initialize
    WScript.Sleep 1000
End If

' Launch the app in borderless App Mode (looks like a native desktop app!)
On Error Resume Next
objShell.Run "msedge --app=http://localhost:5173", 1, False
If Err.Number <> 0 Then
    Err.Clear
    ' Fallback to default browser if Edge is not available
    objShell.Run "http://localhost:5173", 1, False
End If
On Error GoTo 0
