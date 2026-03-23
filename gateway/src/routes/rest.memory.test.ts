import express from 'express';
import request from 'supertest';
import axios from 'axios';

jest.mock('uuid', () => ({ v4: () => '123e4567-e89b-12d3-a456-426614174000' }));

jest.mock('../middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/auth_utils', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('axios');

import restRouter from './rest';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = express();
app.use(express.json());
app.use('/', restRouter);

describe('REST memory routes', () => {
  const originalHypervisorUrl = process.env.HYPERVISOR_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.HYPERVISOR_URL = 'http://hypervisor:8000';
  });

  afterAll(() => {
    process.env.HYPERVISOR_URL = originalHypervisorUrl;
  });

  test('GET /api/v1/memory forwards session_id to hypervisor', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { nodes: [{ id: 'n1' }] } } as any);

    const response = await request(app)
      .get('/api/v1/memory')
      .query({ session_id: 'sess-123' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ nodes: [{ id: 'n1' }] });
    expect(mockedAxios.get).toHaveBeenCalledWith('http://hypervisor:8000/memory?session_id=sess-123');
  });

  test('GET /api/v1/memory returns 500 on hypervisor failure', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('upstream timeout'));

    const response = await request(app).get('/api/v1/memory');

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to fetch memory from Hypervisor');
    expect(response.body.details).toContain('upstream timeout');
  });
});
