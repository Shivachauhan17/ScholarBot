import cluster from "node:cluster";
import express from "express";
import crypto from 'node:crypto';
import os from "node:os";
import { MQClient } from '@scholar-bot/mq';
import cors from 'cors'
import { DBClient } from "@scholar-bot/db-postgres";

const numCpus = os.cpus().length;

if (cluster.isPrimary) {
    for (let i = 0; i < numCpus; i++) {
        cluster.fork()
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`[API Gateway] Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
}
else {
    bootstrapWorker().catch(console.error);
}

async function bootstrapWorker() {
    const app = express()

    app.use(cors({
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
    }));
    app.use(express.json({ limit: '50mb' }))

    const rabbitUrl = process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672"
    const mq = new MQClient(rabbitUrl)
    const channel = await mq.getChannel();
    const db = new DBClient()
    const prisma = await db.getClient()

    const replyQueue = await channel.assertQueue('', { exclusive: true });
    const pendingRequests = new Map();

    channel.consume(replyQueue.queue, (msg) => {
        if (msg) {
            const correlationId = msg.properties.correlationId;
            if (pendingRequests.has(correlationId)) {
                const resolve = pendingRequests.get(correlationId)
                resolve(JSON.parse(msg.content.toString()))
                pendingRequests.delete(correlationId)
            }
        }
    }, { noAck: true })

    app.post('/api/upload', async (req, res) => {
        try {
            const { filename, fileBase64 } = req.body

            if (!filename || !fileBase64) {
                return res.status(400).json({ error: 'Missing filename or fileBase64 payload.' })
            }

            const documentId = crypto.randomUUID();

            // 1. Create the DB record immediately so the UI shows it as "processing"
            await prisma.document.create({
                data: {
                    id: documentId,
                    filename: filename,
                    status: 'processing'
                }
            });

            // 2. Safely wrap the payload in a Buffer and use the CORRECT queue name (dot, not hyphen)
            const payload = Buffer.from(JSON.stringify({ documentId, filename, fileBase64 }));
            channel.sendToQueue('ingestion.tasks', payload, { persistent: true });

            res.status(202).json({
                message: 'document accepted for processing.',
                filename: filename
            })
        }
        catch (error) {
            console.error(`[Worker ${process.pid}] Upload error:`, error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    })

    app.get('/api/documents', async (req, res) => {
        try {
            const documents = await prisma.document.findMany({
                orderBy: { id: 'desc' }
            });
            res.json(documents);
        } catch (error) {
            console.error(`[Worker ${process.pid}] DB error:`, error);
            res.status(500).json({ error: 'Failed to fetch documents' });
        }
    });

    app.post('/api/chat', async (req, res) => {
        try {
            const { question, persona, history } = req.body;
            if (!question) return res.status(400).json({ error: 'Question is required' });

            const correlationId = crypto.randomUUID();

            const responsePromise = new Promise((resolve, reject) => {
                pendingRequests.set(correlationId, resolve);
                setTimeout(() => {
                    pendingRequests.delete(correlationId);
                    reject(new Error("Agent timeout"));
                }, 30000);
            })

            channel.sendToQueue('agent.queries', Buffer.from(JSON.stringify({ question, persona, history })), {
                correlationId: correlationId,
                replyTo: replyQueue.queue
            });

            const result = await responsePromise;
            res.json(result);
        }
        catch (error) {
            console.error(`[Worker ${process.pid}] Chat error:`, error);
            res.status(504).json({ error: 'Agent took too long to respond or failed.' });
        }
    })

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`[API Gateway] Worker ${process.pid} listening on port ${PORT}`);
    });
}