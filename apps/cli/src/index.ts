#!/usr/bin/env node

import * as dotenv from 'dotenv';
import path from 'path';
import { program } from 'commander';
import { login } from './auth.js';
import { startInteractive } from './interactive.js';
import chalk from 'chalk';

// Load .env from the monorepo root
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

program
    .name('quozen')
    .description('CLI for Quozen decentralized expense sharing')
    .version('1.0.0')
    .action(async () => {
        try {
            await startInteractive();
        } catch (e: any) {
            console.error(chalk.red(`Error: ${e.message}`));
            process.exit(1);
        }
    });

program
    .command('login')
    .description('Log in to Google Drive via OAuth2')
    .action(async () => {
        try {
            await login();
        } catch (e: any) {
            console.error(chalk.red(`Login failed: ${e.message}`));
            process.exit(1);
        }
    });

program
    .command('dashboard')
    .description('Open interactive dashboard')
    .action(async () => {
        try {
            await startInteractive();
        } catch (e: any) {
            console.error(chalk.red(`Error: ${e.message}`));
            process.exit(1);
        }
    });

program.parseAsync(process.argv);
