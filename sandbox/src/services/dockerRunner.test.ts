import { runCode } from './dockerRunner';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process');

describe('dockerRunner', () => {
    let mockSpawn: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockSpawn = spawn as jest.Mock;
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    it('should successfully run python code', async () => {
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

        const result = await runPromise;

        expect(mockProcess.kill).toHaveBeenCalled();
        expect(result).toEqual({
            stdout: 'running...\n',
            stderr: 'warning...\n\nExecution timed out'
        });

        jest.useRealTimers();
    });
});
