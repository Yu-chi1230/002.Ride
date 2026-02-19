import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 8001;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
    res.json({ message: '🏍️ Ride API is running!', status: 'ok' });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏍️ Ride backend running on http://0.0.0.0:${PORT}`);
});
