import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import executeRoutes from './routes/execute';

dotenv.config();

const PORT = process.env.SANDBOX_PORT || 4000;

const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:8000', 'http://localhost:5000'] }));
app.use(bodyParser.json());
app.use('/', executeRoutes);

app.listen(PORT, () => {
    console.log(`Execution Sandbox running on port ${PORT}`);
});
