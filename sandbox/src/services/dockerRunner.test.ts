import { runCode } from './dockerRunner';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process');

describe('dockerRunner', () => {
    let mockProcess: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockProcess = new EventEmitter();
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        (spawn as jest.Mock).mockReturnValue(mockProcess);

    let mockSpawn: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSpawn = spawn as jest.Mock;
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    it('should successfully run python code', async () => {
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

    it('should reject for unsupported languages', async () => {
        await expect(runCode('ruby', 'puts "Hello"')).rejects.toThrow('Unsupported language: ruby');
        expect(spawn).not.toHaveBeenCalled();
    });

    it('should successfully run python code', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello, Python!\n'));
    it('should run python code successfully', async () => {
        const mockSpawn = spawn as jest.Mock;
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = jest.fn();

        mockSpawn.mockReturnValue(mockProcess);

        const runPromise = runCode('python', 'print("hello world")');

        mockProcess.stdout.emit('data', 'hello world\n');
        mockProcess.emit('close', 0);

        const result = await runPromise;

        expect(mockSpawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'python:3.9-slim', 'python', '-c', 'print("hello world")'
        ]);
        expect(result).toEqual({ stdout: 'hello world\n', stderr: '' });
    });

    it('should successfully run javascript code', async () => {
        const code = 'print("Hello Python")';
        const promise = runCode('python', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello Python\n'));
        mockProcess.emit('close', 0);

        const result = await promise;

        expect(spawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'python:3.9-slim', 'python', '-c', code
        ]);
        expect(result).toEqual({
            stdout: 'Hello, Python!\n',
            stderr: ''
        });
    });

    it('should successfully run javascript code', async () => {
        const code = 'console.log("Hello, JS!")';
        const promise = runCode('javascript', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello, JS!\n'));
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

        const runPromise = runCode('javascript', 'console.log("hello world")');

        mockProcess.stdout.emit('data', 'hello world\n');
        mockProcess.emit('close', 0);

        const result = await runPromise;

        expect(mockSpawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'node:18-alpine', 'node', '-e', 'console.log("hello world")'
        ]);
        expect(result).toEqual({ stdout: 'hello world\n', stderr: '' });
    });

    it('should reject for unsupported languages', async () => {
        await expect(runCode('ruby', 'puts "hello"')).rejects.toThrow('Unsupported language: ruby');
        expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should handle execution failure (spawn error)', async () => {
        const code = 'console.log("Hello JS")';
        const promise = runCode('javascript', code);

        mockProcess.stdout.emit('data', Buffer.from('Hello JS\n'));
        mockProcess.emit('close', 0);

        const result = await promise;

        expect(spawn).toHaveBeenCalledWith('docker', [
            'run', '--rm', '--memory=256m', 'node:18-alpine', 'node', '-e', code
        ]);
        expect(result).toEqual({
            stdout: 'Hello, JS!\n',
            stderr: ''
        });
    });

    it('should handle process spawn error', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        const error = new Error('Failed to start docker');
        mockProcess.emit('error', error);

        const result = await promise;

        expect(result).toEqual({
            stdout: '',
            stderr: 'Failed to start docker'
        });
    });

    it('should handle process spawn error without message', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        mockProcess.emit('error', {});

        const result = await promise;

        expect(result).toEqual({
            stdout: '',
            stderr: 'Execution failed'
        });
    });

    it('should capture stderr successfully', async () => {
        const code = 'print("Hello, Python!")';
        const promise = runCode('python', code);

        mockProcess.stderr.emit('data', Buffer.from('Some error log\n'));
        mockProcess.emit('close', 1);

        const result = await promise;

        expect(result).toEqual({
            stdout: '',
            stderr: 'Some error log\n'
        });
    });

    it('should handle timeout scenario', async () => {
        const code = 'while True: pass';
        const promise = runCode('python', code);
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

        const runPromise = runCode('python', 'print("hello")');

        mockProcess.emit('error', new Error('Docker is not running'));

        const result = await runPromise;

        expect(result).toEqual({ stdout: '', stderr: 'Docker is not running' });
    });

    it('should clear timeout when process closes normally', async () => {
        jest.useFakeTimers();

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

        const runPromise = runCode('python', 'print("done")');

        mockProcess.emit('close', 0);

        const result = await runPromise;

        // Verify the result
        expect(result).toEqual({ stdout: '', stderr: '' });

        // Advance timers to trigger the timeout, if it wasn't cleared
        jest.advanceTimersByTime(10000);

        // Verify that kill was NOT called (which would happen if timeout triggered)
        expect(mockProcess.kill).not.toHaveBeenCalled();

        jest.useRealTimers();
    });

    it('should clear timeout when process errors out', async () => {
        jest.useFakeTimers();

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

        const runPromise = runCode('python', 'print("error")');

        mockProcess.emit('error', new Error('Something failed'));

        const result = await runPromise;

        // Verify the result
        expect(result).toEqual({ stdout: '', stderr: 'Something failed' });

        // Advance timers to trigger the timeout, if it wasn't cleared
        jest.advanceTimersByTime(10000);

        // Verify that kill was NOT called (which would happen if timeout triggered)
        expect(mockProcess.kill).not.toHaveBeenCalled();

        jest.useRealTimers();
    });

    it('should handle execution timeout', async () => {
        jest.useFakeTimers();

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

        const runPromise = runCode('python', 'while True: pass');

        mockProcess.stdout.emit('data', 'running...\n');
        mockProcess.stderr.emit('data', 'warning...\n');

        // Advance timers by 10000ms
        jest.advanceTimersByTime(10000);

        const result = await promise;

        expect(mockProcess.kill).toHaveBeenCalled();
        expect(result).toEqual({
            stdout: '',
            stderr: '\nExecution timed out'
        });
        const result = await runPromise;

        expect(mockProcess.kill).toHaveBeenCalled();
        expect(result).toEqual({
            stdout: 'running...\n',
            stderr: 'warning...\n\nExecution timed out'
        });

        jest.useRealTimers();
        const promise = runCode('python', 'while True: pass');

        // Fast forward 10 seconds
        jest.advanceTimersByTime(10000);

        const result = await promise;

        expect(mockProcess.kill).toHaveBeenCalled();
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('\nExecution timed out');
    });
});
