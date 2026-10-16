/** Limits retained JS strings; decoded pixels are managed by the WebView. */
export class ImageMemoryCache {
  private entries = new Map<string, string>();
  private bytes = 0;

  constructor(private maxBytes = 8 * 1024 * 1024, private maxEntries = 150) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  has(key: string): boolean { return this.entries.has(key); }

  set(key: string, value: string): void {
    const previous = this.entries.get(key);
    if (previous !== undefined) {
      this.bytes -= this.cost(key, previous);
      this.entries.delete(key);
    }
    const cost = this.cost(key, value);
    if (cost > this.maxBytes || this.maxEntries < 1) return;
    while (this.entries.size >= this.maxEntries || this.bytes + cost > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.cost(oldest, this.entries.get(oldest)!);
      this.entries.delete(oldest);
    }
    this.entries.set(key, value);
    this.bytes += cost;
  }

  clear(): void { this.entries.clear(); this.bytes = 0; }

  private cost(key: string, value: string): number {
    // UTF-16 upper estimate for the URL and base64 string, excluding VM overhead.
    return (key.length + value.length) * 2;
  }
}
