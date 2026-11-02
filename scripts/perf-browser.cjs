// Keep the optional benchmark dependency outside the plugin runtime.
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
const toolsRoot = process.env.ZEPHYR_PLAYWRIGHT_ROOT || path.join(os.homedir(), 'AppData/Local/hermes/hermes-agent');
const { chromium } = require(require.resolve('playwright', { paths: [root, toolsRoot] }));
let executablePath = process.env.ZEPHYR_CHROMIUM;
if (!executablePath && process.platform === 'win32') {
  const cache = path.join(os.homedir(), 'AppData/Local/ms-playwright');
  const versions = fs.existsSync(cache) ? fs.readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a,b) => Number(b.split('-')[1]) - Number(a.split('-')[1])) : [];
  if (versions.length) executablePath = path.join(cache, versions[0], 'chrome-win64/chrome.exe');
}
module.exports = () => chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
