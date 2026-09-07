import { MQClient } from "./index";


async function test() {
    console.log('Testing RabbitMQ connection...');
    const mq = new MQClient('amqp://guest:guest@localhost:5672');

    await mq.getChannel();

    console.log('Success! Closing connection...');
    await mq.close();
}

test().catch(console.error);