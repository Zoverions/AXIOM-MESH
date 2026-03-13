import { spawn } from 'child_process';
import { runCode } from './dockerRunner';
import { EventEmitter } from 'events';

// Mock child_process.spawn
jest.mock('child_process', () => ({
    spawn: jest.fn(),
}));

describe('dockerRunner', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should run python code successfully', async () => {
        const mockSpawn = spawn as jest.Mock;
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn.mockReturnValue(mockProcess);

        const code = 'print("Hello Python")';
        const promise = runCode('python', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello Python\n'));
        mockProcess.emit('close', 0);

        const result = await promise;

        expect(mockSpawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'python:3.9-slim', 'python', '-c', code
        ]);
        expect(result.stdout).toBe('Hello Python\n');
        expect(result.stderr).toBe('');
    });

    it('should run javascript code successfully', async () => {
        const mockSpawn = spawn as jest.Mock;
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn.mockReturnValue(mockProcess);

        const code = 'console.log("Hello JS")';
        const promise = runCode('javascript', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello JS\n'));
        mockProcess.emit('close', 0);

        const result = await promise;

        expect(mockSpawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'node:18-alpine', 'node', '-e', code
        ]);
        expect(result.stdout).toBe('Hello JS\n');
        expect(result.stderr).toBe('');
    });

    it('should reject unsupported languages', async () => {
        await expect(runCode('ruby', 'puts "Hello"')).rejects.toThrow('Unsupported language: ruby');
    });

    it('should capture stderr on error', async () => {
        const mockSpawn = spawn as jest.Mock;
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn.mockReturnValue(mockProcess);

        const promise = runCode('python', 'invalid code');

        mockProcess.stderr.emit('data', Buffer.from('SyntaxError: invalid syntax\n'));
        mockProcess.emit('close', 1);

        const result = await promise;

        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('SyntaxError: invalid syntax\n');
    });

    it('should handle process spawn error', async () => {
        const mockSpawn = spawn as jest.Mock;
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn.mockReturnValue(mockProcess);

        const promise = runCode('python', 'print("test")');

        mockProcess.emit('error', new Error('Failed to start docker'));

        const result = await promise;

        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('Failed to start docker');
    });

    it('should handle fallback spawn error message', async () => {
        const mockSpawn = spawn as jest.Mock;
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn.mockReturnValue(mockProcess);

        const promise = runCode('python', 'print("test")');

        mockProcess.emit('error', {});

        const result = await promise;

        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('Execution failed');
    });

    it('should timeout if execution takes too long', async () => {
        const mockSpawn = spawn as jest.Mock;
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn.mockReturnValue(mockProcess);

        const promise = runCode('python', 'while True: pass');

        // Fast forward 10 seconds
        jest.advanceTimersByTime(10000);

        const result = await promise;

        expect(mockProcess.kill).toHaveBeenCalled();
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('\nExecution timed out');
    });
});
