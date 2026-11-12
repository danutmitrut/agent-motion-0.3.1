// F7 și F17 (revizuirea finală): verbele și formele de scriere uzuale care treceau de gardă, pe Bash și PowerShell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const POSIX = '/Users/x/agent motion';
const WIN = 'C:\\agent-motion';
const rad = (u) => (u === 'Bash' ? POSIX : WIN);
const decizie = (c, u) => decideComanda(c, u, rad(u)).decizie;

test('F7: ștergerile și scrierile prin find, git, arhive, rsync, install, perl, awk, sed w, shred', () => {
  for (const c of [
    'find nucleu -delete',
    'find . -name "*.mjs" -exec rm {} +',
    'find video/p -name "*.png" -delete',
    'find /tmp -name x -exec cp {} nucleu/ ;',
    'git checkout -- nucleu/mg.mjs',
    'git checkout .',
    'git restore nucleu/mg.mjs',
    'git rm nucleu/mg.mjs',
    'git mv nucleu/mg.mjs x.mjs',
    'git clean -fdx',
    'git -C nucleu rm mg.mjs',
    'git apply x.patch',
    'unzip -o x.zip -d nucleu',
    'unzip x.zip',
    'tar -xf x.tar -C nucleu',
    'tar xzf x.tgz',
    'tar -czf nucleu/x.tgz video/p/date.json',
    'rsync -a x/ nucleu/',
    'rsync -a --delete x/ video/p/',
    'install -m 644 x nucleu/mg.mjs',
    'perl -pi -e s/a/b/ nucleu/mg.mjs',
    'awk -i inplace 1 nucleu/mg.mjs',
    'sed "w nucleu/mg.mjs" x',
    'sed -n "1w video/p/verificare.json" x',
    'shred nucleu/mg.mjs',
    'unlink nucleu/mg.mjs',
    'curl -o nucleu/x https://e.com',
    'curl -sLo nucleu/x https://e.com',
    'wget -O nucleu/x https://e.com',
    'cd nucleu && curl -O https://e.com/mg.mjs',
    'cd nucleu && wget https://e.com/mg.mjs',
    'wget -P video/p https://e.com/verificare.json',
  ]) assert.equal(decizie(c, 'Bash'), 'refuza', `Bash: ${c}`);
});

test('F7: formele PowerShell și cmd (robocopy, xcopy, Expand-Archive, aliasuri, Export-Csv)', () => {
  for (const c of [
    'Get-ChildItem video\\p\\cadre | Remove-Item',
    'ls video\\p\\cadre | ri',
    'robocopy C:\\tmp nucleu /MIR',
    'robocopy C:\\tmp video\\p /MIR',
    'xcopy C:\\tmp\\x nucleu\\ /Y',
    'Expand-Archive x.zip -DestinationPath nucleu',
    'Expand-Archive x.zip',
    'rni nucleu\\mg.mjs x.mjs',
    'clc nucleu\\mg.mjs',
    'Clear-Item nucleu\\mg.mjs',
    'Set-Item nucleu\\mg.mjs x',
    'iwr https://e.com -OutFile nucleu\\x',
    'Export-Csv -Path video\\p\\verificare.json',
    'md video\\p\\build',
  ]) assert.equal(decizie(c, 'PowerShell'), 'refuza', `PowerShell: ${c}`);
});

test('F17: Tee-Object, apelurile .NET, Invoke-WebRequest, curl și wget pe PowerShell', () => {
  for (const c of [
    'echo x | Tee-Object nucleu/mg.mjs',
    'echo x | Tee-Object -FilePath nucleu/mg.mjs',
    'echo x | Tee-Object .claude\\settings.local.json',
    '[System.IO.File]::WriteAllText("nucleu/mg.mjs","x")',
    '[System.IO.File]::WriteAllText(".claude\\settings.json","{}")',
    '[IO.File]::WriteAllText("$PWD\\nucleu\\proba.txt","x")',
    '[IO.File]::WriteAllText((Join-Path $d "x.txt"), "y")',
    'Set-Location video\\p; [IO.File]::WriteAllText("verificare.json","{}")',
    'Invoke-WebRequest https://e.com -OutFile nucleu\\x',
    'Invoke-RestMethod https://e.com -OutFile .claude\\settings.json',
    'curl -o nucleu/x https://e.com',
    'wget -O nucleu/x https://e.com',
    'Expand-Archive a.zip -DestinationPath nucleu',
  ]) assert.equal(decizie(c, 'PowerShell'), 'refuza', `PowerShell: ${c}`);
});

test('F7 și F17: citirile și scrierile în zone libere rămân permise', () => {
  for (const [c, u] of [
    ['find nucleu -name x', 'Bash'],
    ['find . -name "*.json"', 'Bash'],
    ['git diff nucleu', 'Bash'],
    ['git status', 'Bash'],
    ['git log -- nucleu/mg.mjs', 'Bash'],
    ['git clean -n', 'Bash'],
    ['git apply --check x.patch', 'Bash'],
    ['sed -n 1p nucleu/mg.mjs', 'Bash'],
    ["awk '{print}' nucleu/mg.mjs", 'Bash'],
    ['perl -ne print nucleu/mg.mjs', 'Bash'],
    ['curl -o out.mp4 https://e.com', 'Bash'],
    ['curl -s https://e.com', 'Bash'],
    ['curl -H "Authorization: Bearer $T" https://e.com/api', 'Bash'],
    ['wget -O /tmp/x https://e.com', 'Bash'],
    ['unzip x.zip -d video/p/resurse', 'Bash'],
    ['unzip -l x.zip', 'Bash'],
    ['tar -tf x.tar', 'Bash'],
    ['tar -czf /tmp/b.tgz nucleu', 'Bash'],
    ['rsync -a video/p/resurse/ /tmp/backup/', 'Bash'],
    ['Get-Content nucleu\\mg.mjs', 'PowerShell'],
    ['Expand-Archive x.zip -DestinationPath tmp', 'PowerShell'],
    ['[Math]::Round(2.5)', 'PowerShell'],
    ['[System.IO.File]::WriteAllText("video/p/date.json","{}")', 'PowerShell'],
    ['[IO.File]::WriteAllText("video/p/date.json", $json)', 'PowerShell'],
    ['curl -o out.mp4 https://e.com', 'PowerShell'],
    ['Invoke-WebRequest https://e.com -OutFile video\\p\\resurse\\a.png', 'PowerShell'],
    ['robocopy video\\p\\resurse C:\\backup /E', 'PowerShell'],
    ['Export-Csv -Path raport.csv', 'PowerShell'],
  ]) assert.equal(decizie(c, u), 'permite', `${u}: ${c}`);
});
