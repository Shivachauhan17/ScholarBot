import { Prisma, PrismaClient } from "@prisma/client";

export class DBClient {
    private ready: Promise<void>;
    public prisma: PrismaClient;


    constructor() {
        this.prisma = new PrismaClient()
        this.ready = this._connect();
    }

    private async _connect() {
        await this.prisma.$connect();
        console.log('[DB] Connected to PostgreSQL via Prisma.');
    }

    public async getClient(): Promise<PrismaClient> {
        await this.ready;
        return this.prisma;
    }


    public async findSimilarChunks(embedding:number[],limit:number=5){
        await this.ready;

        const vectorString=`[${embedding.join(',')}]`;

        return this.prisma.$queryRaw`
            SELECT id,"documentId",content,1-(embedding<-> ${vectorString}::vector) as similarity
            FROM "Chunk"
            ORDER BY embedding <-> ${vectorString}::vector
            LIMIT ${limit}
        `
    }


    public async close(){
        await this.ready;
        await this.prisma.$disconnect();
    }
}