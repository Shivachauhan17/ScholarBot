import amqp from 'amqplib';

export class MQClient {
    private ready: Promise<void>;
    private channel!: amqp.Channel;
    private connection!: amqp.Connection;

    constructor(url: string) {
        this.ready = this._connect(url);
    }

    private async _connect(url: string) {
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
    
        await this.channel.assertExchange('ingestion.events', 'fanout', { durable: true });
        await this.channel.assertQueue('ingestion.tasks', { durable: true });
        await this.channel.assertExchange('agent.rpc', 'direct', { durable: true });
        console.log('[MQ] Connected & topology asserted.');
    }

    public async publish(exchange: string, routingKey: string, msg: object) {
        await this.ready;
        this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(msg)), { persistent: true });
    }

    public async sendToQueue(queue: string, msg: object) {
        await this.ready;
        // FIXED: Added { persistent: true } here to match your system design goals
        this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), { persistent: true });
    }

    public async consume(
        queue: string,
        onMessage: (msg: amqp.ConsumeMessage | null) => void,
        options?: amqp.Options.Consume
    ) {
        await this.ready;
        return this.channel.consume(queue, onMessage, options);
    }

    public async getChannel(): Promise<amqp.Channel> {
        await this.ready;
        return this.channel;
    }

    public async close() {
        await this.ready;
        await this.channel.close();
        await this.connection.close();
    }
}