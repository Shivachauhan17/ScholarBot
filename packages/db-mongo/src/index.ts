import { MongoClient, Db, Collection } from 'mongodb';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface ConversationDoc {
  sessionId: string;
  messages: Message[];
  createdAt: Date;
}

export interface AgentTraceDoc {
  queryId: string;
  agentName: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
  createdAt: Date;
}

export class MongoService {
  private ready: Promise<void>;
  private client!: MongoClient;
  private db!: Db;

  constructor(url: string, dbName: string = 'research_db') {
    this.ready = this._connect(url, dbName);
  }

  private async _connect(url: string, dbName: string) {
    this.client = new MongoClient(url);
    await this.client.connect();
    this.db = this.client.db(dbName);
    console.log('[Mongo] Connected & collections ready.');
  }

  public async getConversationsCollection(): Promise<Collection<ConversationDoc>> {
    await this.ready;
    return this.db.collection<ConversationDoc>('conversations');
  }

  public async getTracesCollection(): Promise<Collection<AgentTraceDoc>> {
    await this.ready;
    return this.db.collection<AgentTraceDoc>('agent_traces');
  }

  public async close() {
    await this.ready;
    await this.client.close();
  }
}