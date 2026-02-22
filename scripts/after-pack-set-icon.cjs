const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

module.exports = async function afterPackSetIcon(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const projectDir = context.packager.projectDir;
  const executableName = `${context.packager.appInfo.productFilename}.exe`;
  const executablePath = path.join(context.appOutDir, executableName);
  const iconPath = path.join(projectDir, "build-resources", "icons", "icon.ico");
  const rceditPath = path.join(
    projectDir,
    "node_modules",
    "electron-winstaller",
    "vendor",
    "rcedit.exe"
  );

  if (!existsSync(executablePath)) {
    throw new Error(`[afterPack] executable not found: ${executablePath}`);
  }
  if (!existsSync(iconPath)) {
    throw new Error(`[afterPack] icon not found: ${iconPath}`);
  }
  if (!existsSync(rceditPath)) {
    throw new Error(`[afterPack] rcedit not found: ${rceditPath}`);
  }

  execFileSync(rceditPath, [executablePath, "--set-icon", iconPath], {
    stdio: "inherit"
  });

  console.log(`[afterPack] icon applied: ${executablePath}`);
};

