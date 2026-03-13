import { runCode } from './dockerRunner';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process', () => ({
    spawn: jest.fn(),
}));

describe('dockerRunner', () => {
    let mockProcess: any;
    let mockSpawn: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn = spawn as jest.Mock;
        mockSpawn.mockReturnValue(mockProcess);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllTimers();
    });

    it('should reject for unsupported languages', async () => {
        await expect(runCode('ruby', 'puts "Hello"')).rejects.toThrow('Unsupported language: ruby');
        expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should run python code successfully', async () => {
        const code = 'print("hello world")';
        const runPromise = runCode('python', code);

        mockProcess.stdout.emit('data', 'hello world\n');
        mockProcess.emit('close', 0);

        const result = await runPromise;

        expect(mockSpawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'python:3.9-slim', 'python', '-c', code
        ]);
        expect(result).toEqual({ stdout: 'hello world\n', stderr: '' });
    });

    it('should run javascript code successfully', async () => {
        const code = 'console.log("hello world")';
        const runPromise = runCode('javascript', code);

        mockProcess.stdout.emit('data', 'hello world\n');
        mockProcess.emit('close', 0);

        const result = await runPromise;

        expect(mockSpawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'node:18-alpine', 'node', '-e', code
        ]);
        expect(result).toEqual({ stdout: 'hello world\n', stderr: '' });
    });

    it('should handle process spawn error', async () => {
        const runPromise = runCode('python', 'print("done")');

        mockProcess.emit('error', new Error('Docker is not running'));

        const result = await runPromise;

        expect(result).toEqual({ stdout: '', stderr: 'Docker is not running' });
    });

    it('should clear timeout when process closes normally', async () => {
        const runPromise = runCode('python', 'print("done")');

        mockProcess.emit('close', 0);

        const result = await runPromise;

        expect(result).toEqual({ stdout: '', stderr: '' });

        jest.advanceTimersByTime(10000);
        expect(mockProcess.kill).not.toHaveBeenCalled();
    });

    it('should timeout if execution takes too long', async () => {
        const runPromise = runCode('python', 'while True: pass');

        mockProcess.stdout.emit('data', 'running...\n');
        mockProcess.stderr.emit('data', 'warning...\n');

        jest.advanceTimersByTime(10000);

        const result = await runPromise;

        expect(mockProcess.kill).toHaveBeenCalled();
        expect(result).toEqual({
            stdout: 'running...\n',
            stderr: 'warning...\n\nExecution timed out'
        });
    });
});
