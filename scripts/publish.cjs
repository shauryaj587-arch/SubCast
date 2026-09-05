const git = require('isomorphic-git');
const fs = require('fs');
const http = require('isomorphic-git/http/node');
const path = require('path');

async function publish() {
  try {
    console.log("Checking Admin Token...");
    if (!fs.existsSync('.admin_token')) {
      throw new Error("Admin Token not found! You are not authorized to publish.");
    }
    const token = fs.readFileSync('.admin_token', 'utf-8').trim();
    if (!token || token.includes("PASTE_YOUR_GITHUB")) {
      throw new Error("Invalid Admin Token. Please paste your real GitHub token in .admin_token");
    }

    const repoConfig = JSON.parse(fs.readFileSync('repo_config.json', 'utf-8'));
    if (repoConfig.github_username.includes("YOUR_GITHUB")) {
      throw new Error("Please set your GitHub username in repo_config.json!");
    }

    const dir = process.cwd();
    const url = `https://github.com/${repoConfig.github_username}/${repoConfig.github_repo}.git`;

    console.log(`\nRepository: ${url}`);
    
    // Check if git is initialized
    if (!fs.existsSync('.git')) {
      console.log("Initializing local Git repository for the first time...");
      await git.init({ fs, dir, defaultBranch: 'main' });
      await git.addRemote({ fs, dir, remote: 'origin', url });
    }

    // Bump version
    const versionFile = 'version.json';
    const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
    let [major, minor, patch] = versionData.version.split('.').map(Number);
    patch += 1;
    versionData.version = `${major}.${minor}.${patch}`;
    fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));
    
    console.log(`\nPublishing new version: v${versionData.version} ...\n`);

    // Add all files
    console.log("Staging files...");
    const FILE_STATUS = await git.statusMatrix({ fs, dir });
    for (const row of FILE_STATUS) {
      const [filepath, head, workdir, stage] = row;
      // Skip ignored folders
      if (filepath.startsWith('node_modules/') || filepath.startsWith('dist/') || filepath.startsWith('.tanstack/') || filepath === '.admin_token') {
        continue;
      }
      if (workdir !== head) {
        if (workdir === 0) {
          await git.remove({ fs, dir, filepath });
        } else {
          await git.add({ fs, dir, filepath });
        }
      }
    }

    // Commit
    console.log("Committing changes...");
    await git.commit({
      fs,
      dir,
      message: `Update v${versionData.version}`,
      author: {
        name: repoConfig.github_username,
        email: "admin@subcast.local"
      }
    });

    // Push
    console.log("Uploading to GitHub... (This may take a minute)");
    await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: 'main',
      force: true,
      onAuth: () => ({ username: token })
    });

    console.log(`\n✅ SUCCESS! Version ${versionData.version} has been published.`);
    console.log("Clients will now automatically see this update!");

  } catch (err) {
    console.error(`\n❌ ERROR: ${err.message}`);
  }
}

publish();
