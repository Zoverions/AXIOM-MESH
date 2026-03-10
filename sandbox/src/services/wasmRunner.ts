import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export async function runWasmCode(base64Wasm: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        try {
            const wasmBuffer = Buffer.from(base64Wasm, 'base64');
            const tempFile = path.join('/tmp', `temp-${Date.now()}.wasm`);
            fs.writeFileSync(tempFile, wasmBuffer);

            // Using wasmtime if installed, or falling back to node execution of wasm
            // We simulate it using node for now
            const runnerScript = `
                const fs = require('fs');
                (async () => {
                    try {
                        const wasmBuffer = fs.readFileSync('${tempFile}');
                        const wasmModule = await WebAssembly.compile(wasmBuffer);
                        const instance = await WebAssembly.instantiate(wasmModule, {
                            env: {
                                print: (arg) => console.log(arg)
                            }
                        });
                        if (instance.exports.main) {
                            console.log("Returned:", instance.exports.main());
                        } else {
                            console.log("WASM execution successful. No main export.");
                        }
                    } catch (e) {
                        console.error(e);
                    }
                })();
            `;

            const runnerFile = path.join('/tmp', `runner-${Date.now()}.js`);
            fs.writeFileSync(runnerFile, runnerScript);

            const proc = spawn('node', [runnerFile]);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                try { fs.unlinkSync(tempFile); } catch (e) {}
                try { fs.unlinkSync(runnerFile); } catch (e) {}
                resolve({ stdout, stderr });
            });

            proc.on('error', (error) => {
                try { fs.unlinkSync(tempFile); } catch (e) {}
                try { fs.unlinkSync(runnerFile); } catch (e) {}
                resolve({ stdout: '', stderr: error.message || 'WASM Execution failed' });
            });

            setTimeout(() => {
                proc.kill();
                try { fs.unlinkSync(tempFile); } catch (e) {}
                try { fs.unlinkSync(runnerFile); } catch (e) {}
                resolve({ stdout, stderr: stderr + '\nExecution timed out' });
            }, 10000);

        } catch (e: any) {
            resolve({ stdout: '', stderr: e.message || 'Failed to prepare WASM code' });
        }
    });
}
