import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth', () => ({
    authMiddleware: (_req: any, _res: any, next: any) => next()
}));

import router from './payroll';

const app = express();
app.use(express.json());
app.use('/payroll', router);

describe('Payroll route validation', () => {
    test('GET /payroll/pending/:employeeAddress rejects invalid address', async () => {
        const response = await request(app).get('/payroll/pending/not-an-address');
        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid employee address');
    });

    test('GET /payroll/claims/:employeeAddress rejects invalid address', async () => {
        const response = await request(app).get('/payroll/claims/not-an-address');
        expect(response.status).toBe(400);
    });

    test('POST /payroll/employees validates salaryPerInterval', async () => {
        const response = await request(app)
            .post('/payroll/employees')
            .send({ employeeAddress: '0x0000000000000000000000000000000000000001', salaryPerInterval: 0 });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('salaryPerInterval');
    });
});
