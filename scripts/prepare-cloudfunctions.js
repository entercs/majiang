const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'cloudfunctions');
const shared = path.join(root, '_shared');
const check = process.argv.includes('--check');
let stale = false;
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === '_shared') continue;
  const target = path.join(root, entry.name);
  if (!fs.existsSync(path.join(target, 'package.json'))) continue;
  const used = new Set();
  function include(name) {
    if (used.has(name)) return;
    used.add(name);
    const source = fs.readFileSync(path.join(shared, name), 'utf8');
    for (const match of source.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)) include(match[1] + '.js');
  }
  const index = fs.readFileSync(path.join(target, 'index.js'), 'utf8');
  for (const match of index.matchAll(/require\(['"]\.\/_shared\/([^'"]+)['"]\)/g)) include(match[1] + '.js');
  // 同步已有副本，防止历史上的算分与规则引擎副本继续漂移。
  const dest = path.join(target, '_shared');
  if (fs.existsSync(dest)) for (const name of fs.readdirSync(dest)) {
    if (fs.existsSync(path.join(shared, name))) include(name);
  }
  for (const name of used) {
    const source = fs.readFileSync(path.join(shared, name));
    const file = path.join(dest, name);
    if (check) {
      if (!fs.existsSync(file) || !source.equals(fs.readFileSync(file))) {
        console.error('Shared module requires preparation:', path.relative(root, file));
        stale = true;
      }
    } else {
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(file, source);
    }
  }
}
if (stale) process.exitCode = 1;
else console.log(check ? 'Cloud shared modules are consistent.' : 'Cloud shared modules prepared.');
