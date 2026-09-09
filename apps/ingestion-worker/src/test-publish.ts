import { MQClient } from '@scholar-bot/mq';


async function runTest() {
    const mq = new MQClient('amqp://guest:guest@localhost:5672');
    
    // A perfectly valid minimal blank PDF encoded in Base64 
    // (so pdf-parse doesn't crash looking for the %PDF- header)
    const minimalValidPdfBase64 = "JVBERi0xLjEKJcKlwrQKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2VzIDIgMCBSCiAgPj4KZW5kb2JqCjIgMCBvYmoKICA8PCAvVHlwZSAvUGFnZXMKICAgICAvS2lkcyBbIDMgMCBSIF0KICAgICAvQ291bnQgMQogID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UKICAgICAvUGFyZW50IDIgMCBSCiAgICAgL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXQogID4+CmVuZG9iagp0cmFpbGVyCiAgPDwgL1Jvb3QgMSAwIFIKICAgICAvU2l6ZSA0CiAgPj4KJSVFT0YK";

    const task = {
        filename: 'real-test-doc.pdf',
        fileBase64: minimalValidPdfBase64
    };

    console.log('Sending test task to ingestion.tasks queue...');
    await mq.sendToQueue('ingestion.tasks', task);
    
    console.log('Task sent! Check your worker logs.');
    setTimeout(() => process.exit(0), 1000); 
}

runTest().catch(console.error);