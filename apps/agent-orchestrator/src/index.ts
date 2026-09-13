import { MQClient } from '@scholar-bot/mq';
import { DBClient } from '@scholar-bot/db-postgres';
import { HfInference } from '@huggingface/inference';
import OpenAI from "openai";

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

async function bootstrap() {
    const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    const mq = new MQClient(rabbitUrl);

    const db = new DBClient();
    const prisma = await db.getClient();

    const hfToken = process.env.HF_TOKEN;
    const hf = new HfInference(hfToken);

    const channel = await mq.getChannel();
    await channel.assertQueue('agent.queries', { durable: true });

    console.log('[Agent Orchestrator] Listening for RPC queries...');

    await mq.consume('agent.queries', async (msg) => {
        if (!msg) return;

        const replyTo = msg.properties.replyTo;
        const correlationId = msg.properties.correlationId;
        const { question } = JSON.parse(msg.content.toString());

        console.log(`[Agent] Received query: "${question}"`);

        try {
            // 1. Embed the user's question
            const embeddingResponse = await hf.featureExtraction({
                model: 'sentence-transformers/all-MiniLM-L6-v2',
                inputs: question,
            });
            const vectorString = `[${(embeddingResponse as number[]).join(',')}]`;

            // 2. Vector Search in PostgreSQL
            const searchResults = await prisma.$queryRaw<Array<{ content: string }>>`
                SELECT content 
                FROM "Chunk" 
                ORDER BY embedding <=> ${vectorString}::vector 
                LIMIT 3;
            `;

            const context = searchResults.map(res => res.content).join('\n\n');
            console.log(`[Agent] Retrieved ${searchResults.length} context chunks. Generating answer...`);

            // 3. Generate Answer using Grok (xAI) Chat Completion
            const chatResponse = await groq.chat.completions.create({
                model: "openai/gpt-oss-120b", // Changed to the universally accessible Llama 3 model ID
                messages: [
                    {
                        role: "user",
                        content: `You are a helpful research assistant. Answer the user's question using ONLY the provided context. If the answer is not in the context, say "I cannot answer this based on the provided documents."\n\nContext:\n${context}\n\nQuestion: ${question}`
                    }
                ],
                max_tokens: 512,
                temperature: 0.1
            });

            const answer = chatResponse.choices[0].message.content || "No answer generated.";

            // 4. Send the result back to the API Gateway
            if (replyTo) {
                channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ answer: answer.trim(), context })), {
                    correlationId: correlationId
                });
            }

            channel.ack(msg);
            console.log(`[Agent] Answer sent back to Gateway.`);

        }
        catch (error: any) {
            console.error('[Agent] Error name:', error?.name);
            console.error('[Agent] Error message:', error?.message);
            console.error('[Agent] Response body:', error?.error ?? error?.response?.data ?? error?.httpResponse?.body);
            console.error('[Agent] Full error:', error);
            if (replyTo) {
                channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ error: 'Failed to generate answer' })), {
                    correlationId: correlationId
                });
            }
            channel.nack(msg, false, false);
        }
    });
}

bootstrap().catch(console.error);