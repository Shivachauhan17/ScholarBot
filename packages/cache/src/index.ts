import Redis from 'ioredis';

export class CacheClient {
  private client: Redis;
  private pending = new Map<string, Promise<any>>();

  constructor(url: string) {
    this.client = new Redis(url);
    this.client.on('connect', () => {
      console.log('[Cache] Connected to Redis.');
    });
  }

  public async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  public async setex(key: string, seconds: number, value: string): Promise<string> {
    return this.client.setex(key, seconds, value);
  }

  public async cacheAside<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Stampede prevention: if a promise for this key is already in flight, reuse it
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    const promise = compute()
      .then(async (result) => {
        await this.setex(key, ttlSeconds, JSON.stringify(result));
        this.pending.delete(key);
        return result;
      })
      .catch((err) => { 
        this.pending.delete(key); 
        throw err; 
      }); // Never cache a rejected promise

    this.pending.set(key, promise);
    return promise;
  }

  public async close() {
    await this.client.quit();
  }
}