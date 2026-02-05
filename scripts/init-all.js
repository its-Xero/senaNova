#!/usr/bin/env node
// Cross-platform init script: runs PowerShell installer on Windows, shell installer elsewhere.
const { spawn } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

const installer = isWin ? path.join(repoRoot, 'install_deps.ps1') : path.join(repoRoot, 'install_deps.sh');
const cmd = isWin ? 'powershell' : 'sh';
const args = isWin ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installer] : [installer];

const child = spawn(cmd, args, { stdio: 'inherit', shell: false });

child.on('exit', code => process.exit(code));
child.on('error', err => { console.error(err); process.exit(1); });
