#!/usr/bin/env node

// Script to convert pnpm workspace:* and catalog: references to regular npm dependencies
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Catalog versions from the pnpm-workspace.yaml file
const catalogVersions = {
  '@n8n/typeorm': '0.3.20-12',
  '@sentry/node': '8.52.1',
  '@types/basic-auth': '^1.1.3',
  '@types/express': '^5.0.1',
  '@types/jsonwebtoken': '^9.0.9',
  '@types/lodash': '^4.17.17',
  '@types/uuid': '^10.0.0',
  '@types/xml2js': '^0.4.14',
  'axios': '1.8.3',
  'basic-auth': '2.0.1',
  'callsites': '3.1.0',
  'chokidar': '4.0.1',
  'fast-glob': '3.2.12',
  'flatted': '3.2.7',
  'form-data': '4.0.0',
  'http-proxy-agent': '7.0.2',
  'https-proxy-agent': '7.0.6',
  'iconv-lite': '0.6.3',
  'jsonwebtoken': '9.0.2',
  'js-base64': '3.7.2',
  'lodash': '4.17.21',
  'luxon': '3.4.4',
  'nanoid': '3.3.8',
  'picocolors': '1.0.1',
  'reflect-metadata': '0.2.2',
  'rimraf': '^6.0.1',
  'tsup': '^8.4.0',
  'tsx': '^4.19.3',
  'uuid': '10.0.0',
  'xml2js': '0.6.2',
  'xss': '1.0.15',
  'zod': '3.24.1',
  'zod-to-json-schema': '3.23.3',
  '@langchain/core': '0.3.48',
  '@langchain/openai': '0.5.0',
  '@langchain/anthropic': '0.3.21',
  '@langchain/community': '0.3.24',
  '@n8n_io/ai-assistant-sdk': '1.14.0'
};

// Frontend catalog versions
const frontendCatalogVersions = {
  '@testing-library/jest-dom': '^6.6.3',
  '@testing-library/user-event': '^14.6.1',
  '@testing-library/vue': '^8.1.0',
  '@vue/tsconfig': '^0.7.0',
  '@vueuse/core': '^10.11.0',
  '@vitest/coverage-v8': '^3.1.3',
  '@vitejs/plugin-vue': '^5.2.4',
  '@sentry/vue': '^8.33.1',
  'pinia': '^2.2.4',
  'typescript': '^5.8.2',
  'vite': '^6.3.5',
  'vitest': '^3.1.3',
  'vitest-mock-extended': '^3.1.0',
  'vue': '^3.5.13',
  'vue-i18n': '^11.1.2',
  'vue-router': '^4.5.0',
  'vue-tsc': '^2.2.8',
  'vue-markdown-render': '^2.2.1',
  'highlight.js': '^11.8.0',
  'element-plus': '2.4.3'
};

// Get all workspace package versions
function getAllPackageVersions() {
  const packagesDir = path.join(__dirname, '../packages');
  const workspacePackages = new Map();

  // Function to scan package directories recursively
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        scanDir(fullPath);
      } else if (entry.name === 'package.json') {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const pkg = JSON.parse(content);
          if (pkg.name && pkg.version) {
            workspacePackages.set(pkg.name, pkg.version);
          }
        } catch (e) {
          // Skip files that can't be parsed
        }
      }
    }
  }
  
  scanDir(packagesDir);
  return workspacePackages;
}

const workspacePackages = getAllPackageVersions();
console.log(`Found ${workspacePackages.size} packages in the workspace`);

// Function to update a package.json file
function updatePackageJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const pkg = JSON.parse(content);
    let changed = false;
    
    // Function to process dependencies
    function processDeps(deps) {
      if (!deps) return false;
      let hasChanges = false;
      
      for (const [name, version] of Object.entries(deps)) {
        // Handle workspace: references
        if (typeof version === 'string' && version.startsWith('workspace:')) {
          if (workspacePackages.has(name)) {
            deps[name] = workspacePackages.get(name);
            console.log(`  - ${name}: ${version} -> ${deps[name]}`);
            hasChanges = true;
          } else {
            let newVersion = '^0.0.0';
            if (version !== 'workspace:*') {
              newVersion = version.replace('workspace:', '');
            }
            deps[name] = newVersion;
            console.log(`  - ${name}: ${version} -> ${deps[name]}`);
            hasChanges = true;
          }
        }
        
        // Handle catalog: references
        if (typeof version === 'string' && version === 'catalog:') {
          if (catalogVersions[name]) {
            deps[name] = catalogVersions[name];
            console.log(`  - ${name}: catalog: -> ${deps[name]}`);
            hasChanges = true;
          } else {
            deps[name] = '^0.0.0';
            console.log(`  - ${name}: catalog: -> ${deps[name]} (unknown catalog reference)`);
            hasChanges = true;
          }
        }
        
        // Handle catalog:frontend references
        if (typeof version === 'string' && version === 'catalog:frontend') {
          if (frontendCatalogVersions[name]) {
            deps[name] = frontendCatalogVersions[name];
            console.log(`  - ${name}: catalog:frontend -> ${deps[name]}`);
            hasChanges = true;
          } else {
            deps[name] = '^0.0.0';
            console.log(`  - ${name}: catalog:frontend -> ${deps[name]} (unknown frontend catalog reference)`);
            hasChanges = true;
          }
        }
      }
      
      return hasChanges;
    }

    // Process all types of dependencies
    console.log(`Processing ${filePath}:`);
    const changedDeps = processDeps(pkg.dependencies);
    const changedDevDeps = processDeps(pkg.devDependencies);
    const changedPeerDeps = processDeps(pkg.peerDependencies);
    const changedOptDeps = processDeps(pkg.optionalDependencies);
    
    changed = changedDeps || changedDevDeps || changedPeerDeps || changedOptDeps;
    
    // Update pnpm scripts to npm
    if (pkg.scripts) {
      for (const [scriptName, scriptValue] of Object.entries(pkg.scripts)) {
        if (scriptValue.includes('pnpm ')) {
          pkg.scripts[scriptName] = scriptValue.replace(/pnpm /g, 'npm run ');
          console.log(`  - script ${scriptName}: ${scriptValue} -> ${pkg.scripts[scriptName]}`);
          changed = true;
        }
      }
    }
    
    // Update the main package.json
    if (filePath === path.join(__dirname, '../package.json')) {
      // Make sure we have workspaces
      if (!pkg.workspaces) {
        pkg.workspaces = [
          "packages/*",
          "packages/@n8n/*",
          "packages/frontend/**",
          "packages/extensions/**",
          "cypress"
        ];
        changed = true;
      }
      
      // Remove pnpm-specific configuration
      if (pkg.pnpm) {
        delete pkg.pnpm;
        changed = true;
      }
      
      if (pkg.packageManager) {
        delete pkg.packageManager;
        changed = true;
      }
      
      // Update engines to specify Node 22
      if (pkg.engines && pkg.engines.node) {
        pkg.engines.node = ">=22.0.0";
        changed = true;
      }
    }
    
    // Write updated package.json only if changes were made
    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log(`Updated ${filePath}`);
    } else {
      console.log(`No changes needed for ${filePath}`);
    }
  } catch (error) {
    console.error(`Failed to update ${filePath}: ${error.message}`);
  }
}

// Process the root package.json
updatePackageJson(path.join(__dirname, '../package.json'));

// Function to recursively find all package.json files
function findPackageJsonFiles(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  const packageJsons = [];
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && !fullPath.includes('node_modules')) {
      // Recursively scan directories that aren't node_modules
      packageJsons.push(...findPackageJsonFiles(fullPath));
    } else if (file.name === 'package.json') {
      packageJsons.push(fullPath);
    }
  }
  
  return packageJsons;
}

// Find and update all package.json files in the monorepo
console.log('Finding all package.json files...');
const packagesDir = path.join(__dirname, '../packages');
const packageJsonFiles = findPackageJsonFiles(packagesDir);
console.log(`Found ${packageJsonFiles.length} package.json files in the packages directory`);

// Also add the cypress package.json
const cypressPackageJson = path.join(__dirname, '../cypress/package.json');
if (fs.existsSync(cypressPackageJson)) {
  packageJsonFiles.push(cypressPackageJson);
}

// Update all package.json files
for (const file of packageJsonFiles) {
  updatePackageJson(file);
}

console.log('Conversion completed successfully');
console.log('Remember to delete the pnpm-lock.yaml file and run npm install to generate package-lock.json');
