import fs from 'node:fs';

const rootGradlePath = 'src-tauri/gen/android/build.gradle.kts';
if (fs.existsSync(rootGradlePath)) {
  let content = fs.readFileSync(rootGradlePath, 'utf8');
  if (!content.includes('resolutionStrategy')) {
    content += `
allprojects {
    configurations.all {
        resolutionStrategy {
            force("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
            force("org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.25")
            force("org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.9.25")
            force("org.jetbrains.kotlin:kotlin-stdlib-common:1.9.25")
            force("org.jetbrains.kotlin:kotlin-reflect:1.9.25")
        }
    }
}
`;
    fs.writeFileSync(rootGradlePath, content, 'utf8');
    console.log('Patch aplicado a ' + rootGradlePath);
  }
}

const appGradlePaths = [
  'src-tauri/gen/android/app/build.gradle.kts',
  'src-tauri/gen/android/app/build.gradle',
];
const appGradlePath = appGradlePaths.find((p) => fs.existsSync(p));
if (!appGradlePath) {
  console.error('No se encontró el archivo Gradle de la app Android');
  process.exit(1);
}

let appContent = fs.readFileSync(appGradlePath, 'utf8');
const isKts = appGradlePath.endsWith('.kts');
const castDep = 'com.google.android.gms:play-services-cast-framework:21.5.0';

if (!appContent.includes('play-services-cast-framework')) {
  const depLine = isKts
    ? `    implementation("${castDep}")`
    : `    implementation '${castDep}'`;
  appContent = appContent.replace(/dependencies\s*\{/, `dependencies {\n${depLine}`);
}

if (!appContent.includes('resolutionStrategy')) {
  const strategy = isKts
    ? `
configurations.all {
    resolutionStrategy {
        force("org.jetbrains.kotlin:kotlin-stdlib:1.9.25")
        force("org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.25")
        force("org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.9.25")
        force("org.jetbrains.kotlin:kotlin-stdlib-common:1.9.25")
        force("org.jetbrains.kotlin:kotlin-reflect:1.9.25")
    }
}
`
    : `
configurations.all {
    resolutionStrategy {
        force 'org.jetbrains.kotlin:kotlin-stdlib:1.9.25'
        force 'org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.9.25'
        force 'org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.9.25'
        force 'org.jetbrains.kotlin:kotlin-stdlib-common:1.9.25'
        force 'org.jetbrains.kotlin:kotlin-reflect:1.9.25'
    }
}
`;
  appContent += strategy;
}

fs.writeFileSync(appGradlePath, appContent, 'utf8');

const finalCheck = fs.readFileSync(appGradlePath, 'utf8');
if (!finalCheck.includes('play-services-cast-framework')) {
  console.error('Error crítico: No se pudo inyectar play-services-cast-framework en ' + appGradlePath);
  process.exit(1);
}
console.log('Gradle de Android parcheado exitosamente con Cast 21.5.0 y Kotlin 1.9.25');
