#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const banned = JSON.parse(fs.readFileSync(path.join(__dirname, 'banned-words.json'), 'utf8'));
const TARGET_DIRS = ['miniprogram', 'cloudfunctions', 'docs'];
const EXCLUDE_DIRS = new Set(['node_modules', 'miniprogram_npm', 'superpowers']); // exclude design/plan docs which enumerate banned words
const TARGET_EXTS = ['.js', '.wxml', '.wxss', '.json', '.md'];

let violations = [];

function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      scan(full);
    } else if (TARGET_EXTS.some(ext => entry.name.endsWith(ext))) {
      const content = fs.readFileSync(full, 'utf8');
      banned.forEach((word) => {
        if (content.includes(word)) {
          violations.push({ file: full, word });
        }
      });
    }
  }
}

TARGET_DIRS.forEach(scan);

if (violations.length === 0) {
  console.log('✅ 未发现违规词');
  process.exit(0);
}

console.log(`❌ 发现 ${violations.length} 处违规词：`);
violations.forEach(v => {
  console.log(`  ${v.file} → ${v.word}`);
});
process.exit(1);
