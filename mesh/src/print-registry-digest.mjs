import { readFile } from 'node:fs/promises';
import { digestObject } from './lib/canonical.mjs';

const registry = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
console.log(JSON.stringify({ probe_registry_digest: digestObject(registry) }));
