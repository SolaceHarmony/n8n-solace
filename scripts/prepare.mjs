#!/usr/bin/env node

import { execSync } from 'node:child_process';

// Skip lefthook install in CI or Docker build
if (process.env.CI || process.env.DOCKER_BUILD) {
	process.exit(0);
}

// Only use npm as the package manager
try {
	// Check if npm is available
	execSync('command -v npm', { stdio: 'ignore' });
	execSync('npm exec lefthook install', { stdio: 'inherit' });
} catch (error) {
	console.error('npm is not available. Please install npm.');
	process.exit(1);
}
