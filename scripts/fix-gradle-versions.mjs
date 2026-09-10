import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const replacements = [
  {
    file: 'android/capacitor-cordova-android-plugins/build.gradle',
    rules: [
      ['com.android.tools.build:gradle:8.13.0', 'com.android.tools.build:gradle:8.7.3'],
      ['compileSdkVersion : 36', 'compileSdkVersion : 35'],
      ['targetSdkVersion : 36', 'targetSdkVersion : 35'],
      ['JavaVersion.VERSION_21', 'JavaVersion.VERSION_17'],
    ],
  },
  {
    file: 'android/app/capacitor.build.gradle',
    rules: [['JavaVersion.VERSION_21', 'JavaVersion.VERSION_17']],
  },
];

let updatedFiles = 0;

for (const { file, rules } of replacements) {
  const absolutePath = join(rootDir, file);

  if (!existsSync(absolutePath)) {
    console.warn(`[fix-gradle-versions] Skipping missing file: ${file}`);
    continue;
  }

  let content = readFileSync(absolutePath, 'utf8');
  let changed = false;

  for (const [from, to] of rules) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(absolutePath, content, 'utf8');
    updatedFiles += 1;
  }
}

console.log(`[fix-gradle-versions] Completed. Updated ${updatedFiles} file(s).`);
