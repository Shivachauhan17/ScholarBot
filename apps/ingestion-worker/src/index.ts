import Piscina from "piscina";
import path from 'path';
import {MQClient} from '@scholar-bot/mq';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";


async function bootstrap(){
    const rabbitUrl=process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'
    const mq=new MQClient(rabbitUrl)

    const pool=new Piscina({
        filename:path.resolve(__dirname,'parse-worker.js'),
        minThreads: 2,
        maxThreads:4
    })

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 2000,   
        chunkOverlap: 200, 
    });

    console.log('[Ingestion Worker] Thread pool and MQ client initializing...');

    await mq.consume('ingestion.tasks',async(msg)=>{
        if(!msg) return;

        try{
            const taskData=JSON.parse(msg.content.toString());
            console.log(`[Ingestion Worker] Processing document: ${taskData.filename || 'unknown'}`);

            const dummyPdfBuffer=Buffer.from(taskData.fileBase64 || '','base64');

            if(dummyPdfBuffer.length>0){
                const text:string=await pool.run(
                    {buffer:Array.from(dummyPdfBuffer)},
                    {name:'default'}
                )
                console.log(`[Ingestion Worker] Successfully parsed ${text.length} characters.`);

                const chunks=await splitter.createDocuments([text])
                console.log(`[Ingestion Worker] Split document into ${chunks.length} chunks.`);
            }

            const channel=await mq.getChannel();
            channel.ack(msg);
        }catch(error){
            console.error('[Ingestion Worker] Error processing task:', error);
            const channel = await mq.getChannel();
            channel.nack(msg, false, false);
        }
    });
    console.log('[Ingestion Worker] Waiting for messages on ingestion.tasks...');
}


bootstrap().catch(console.error);