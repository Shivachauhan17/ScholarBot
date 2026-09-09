import Piscina from "piscina";
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { HfInference } from '@huggingface/inference';
import { MQClient } from '@scholar-bot/mq';
import { DBClient } from '@scholar-bot/db-postgres';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";


async function bootstrap() {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'
    const mq = new MQClient(rabbitUrl)

    const db = new DBClient();
    const prisma = await db.getClient()

    const hf = new HfInference(process.env.HF_TOKEN);

    const pool = new Piscina({
        filename: path.resolve(__dirname, __filename.endsWith('.ts') ? 'parse-worker.ts' : 'parse-worker.js'),
        minThreads: 2,
        maxThreads: 4
    });

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000,
        chunkOverlap: 200,
    });

    console.log('[Ingestion Worker] Thread pool and MQ client initializing...');

    await mq.consume('ingestion.tasks', async (msg) => {
        if (!msg) return;

        try {
            const taskData = JSON.parse(msg.content.toString());
            const filename = taskData.filename || 'unknown_document.pdf';
            console.log(`[Ingestion Worker] Processing document: ${taskData.filename || 'unknown'}`);

            const documentId = uuidv4();
            await prisma.document.create({
                data: {
                    id: documentId,
                    filename: filename,
                    status: 'processing'
                }
            });

            const dummyPdfBuffer = Buffer.from(taskData.fileBase64 || '', 'base64');

            if (dummyPdfBuffer.length > 0) {
                const text: string = await pool.run(
                    { buffer: Array.from(dummyPdfBuffer) },
                    { name: 'default' }
                )
                console.log(`[Ingestion Worker] Successfully parsed ${text.length} characters.`);

                const chunks = await splitter.createDocuments([text])
                const chunkTexts = chunks.map(c => c.pageContent);
                console.log(`[Ingestion Worker] Split document into ${chunks.length} chunks.`);

                const BATCH_SIZE = 100;
                for (let i = 0; i < chunkTexts.length; i += BATCH_SIZE) {
                    const batch = chunkTexts.slice(i, i + BATCH_SIZE);
                    const response = await hf.featureExtraction({
                        model: 'sentence-transformers/all-MiniLM-L6-v2',
                        inputs: batch,
                    });

                    const embeddings = response as number[][];
                    for (let j = 0; j < batch.length; j++) {
                        const content = batch[j];
                        const embedding = embeddings[j];

                        const vectorString = `[${embedding.join(',')}]`;
                        const chunkId = uuidv4();

                        await prisma.$executeRaw`
                            INSERT INTO "Chunk" (id, "documentId", content, embedding)
                            VALUES (${chunkId}, ${documentId}, ${content}, ${vectorString}::vector)
                        `;
                    }
                }

                await prisma.document.update({
                    where: { id: documentId },
                    data: { status: 'ready' }
                });
                console.log(`[Ingestion Worker] Finished processing and saving ${filename}.`);

                await mq.publish('ingestion.events', '', {
                    type: 'document.ready',
                    documentId: documentId,
                    filename: filename,
                    chunksGenerated: chunkTexts.length,
                    timestamp: new Date().toISOString()
                });
            }

            const channel = await mq.getChannel();
            channel.ack(msg);
        } catch (error) {
            console.error('[Ingestion Worker] Error processing task:', error);
            const channel = await mq.getChannel();
            channel.nack(msg, false, false);
        }
    });
    console.log('[Ingestion Worker] Waiting for messages on ingestion.tasks...');
}


bootstrap().catch(console.error);