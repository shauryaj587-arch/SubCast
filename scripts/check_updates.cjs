const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

async function checkUpdates() {
  try {
    if (fs.existsSync('.admin_token')) {
      // Admin PC doesn't need to pull from GitHub, they push to it!
      return;
    }

    const repoConfig = JSON.parse(fs.readFileSync('repo_config.json', 'utf-8'));
    if (repoConfig.github_username.includes("YOUR_GITHUB")) {
      return; // Not configured yet
    }

    const localVersion = JSON.parse(fs.readFileSync('version.json', 'utf-8')).version;
    
    // Fetch remote version.json
    const rawUrl = `https://raw.githubusercontent.com/${repoConfig.github_username}/${repoConfig.github_repo}/main/version.json`;
    
    const remoteVersionData = await new Promise((resolve, reject) => {
      https.get(rawUrl, (res) => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });

    if (!remoteVersionData || !remoteVersionData.version) return;

    // Compare versions (simple logic)
    if (remoteVersionData.version !== localVersion) {
      console.log(`Update found! Local: ${localVersion}, Remote: ${remoteVersionData.version}`);
      
      // Use a VBScript popup to ask the user nicely
      const vbsPath = path.join(process.env.TEMP, 'update_prompt.vbs');
      const vbsCode = `
        Dim result
        result = MsgBox("A new update for SubCast (v${remoteVersionData.version}) is available!" & vbCrLf & vbCrLf & "Do you want to download and install it now?", vbYesNo + vbQuestion, "SubCast Update Available")
        If result = vbYes Then
            WScript.Quit 1
        Else
            WScript.Quit 0
        End If
      `;
      fs.writeFileSync(vbsPath, vbsCode);
      
      try {
        execSync(`cscript //nologo "${vbsPath}"`);
      } catch (e) {
        // Exit code 1 means user clicked YES
        if (e.status === 1) {
          console.log("User accepted update. Downloading...");
          await downloadAndInstallUpdate(repoConfig.github_username, repoConfig.github_repo);
        }
      }
    }
  } catch(e) {
    console.error("Update check failed (ignored):", e.message);
  }
}

async function downloadAndInstallUpdate(username, repo) {
  const zipUrl = `https://github.com/${username}/${repo}/archive/refs/heads/main.zip`;
  const zipPath = path.join(process.env.TEMP, 'subcast_update.zip');
  
  // Show a downloading message
  const vbsPath = path.join(process.env.TEMP, 'download_msg.vbs');
  fs.writeFileSync(vbsPath, `MsgBox "Downloading update... Please wait a few moments. The app will launch automatically when done.", vbInformation, "SubCast"`);
  execSync(`start cscript //nologo "${vbsPath}"`);

  // Download ZIP
  await new Promise((resolve, reject) => {
    https.get(zipUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (redirectRes) => {
          const file = fs.createWriteStream(zipPath);
          redirectRes.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        });
      } else {
        const file = fs.createWriteStream(zipPath);
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }
    });
  });

  // Extract ZIP
  console.log("Extracting...");
  const zip = new AdmZip(zipPath);
  const zipEntries = zip.getEntries();
  const rootDirName = zipEntries[0].entryName.split('/')[0]; // e.g., SubCast-main
  
  zip.extractAllTo(process.env.TEMP, true);
  
  const extractedPath = path.join(process.env.TEMP, rootDirName);
  
  // Copy files over current directory
  execSync(`xcopy /s /e /y "${extractedPath}\\*" "${process.cwd()}"`);
  
  // Clean up
  fs.rmSync(extractedPath, { recursive: true, force: true });
  fs.unlinkSync(zipPath);

  // Re-run npm install just in case
  console.log("Installing dependencies...");
  execSync(`npm install`, { stdio: 'inherit' });

  // Update complete!
}

checkUpdates();
