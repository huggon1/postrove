type Request = {
  connectionId?: string;
  grant: (release: () => void) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

/** Connection jobs share Chrome; collection and maintenance jobs form barriers. */
export class BrowserTaskQueue {
  private pending: Request[] = [];
  private active = new Set<string>();
  private exclusive = false;
  private closed = false;
  private idle = new Set<() => void>();

  async run<T>(
    work: () => Promise<T>,
    signal?: AbortSignal,
    connectionId?: string,
  ): Promise<T> {
    const release = await this.acquire(signal, connectionId);
    try {
      signal?.throwIfAborted();
      return await work();
    } finally {
      release();
    }
  }

  private acquire(signal?: AbortSignal, connectionId?: string) {
    return new Promise<() => void>((resolve, reject) => {
      if (this.closed) return reject(new Error("Browser is shutting down"));
      if (signal?.aborted) return reject(new Error("Cancelled"));
      const request: Request = {
        connectionId,
        grant: resolve,
        reject,
        cleanup: () => signal?.removeEventListener("abort", cancel),
      };
      const cancel = () => {
        const index = this.pending.indexOf(request);
        if (index < 0) return;
        this.pending.splice(index, 1);
        request.cleanup();
        reject(new Error("Cancelled"));
        this.pump();
      };
      this.pending.push(request);
      signal?.addEventListener("abort", cancel, { once: true });
      this.pump();
    });
  }

  private pump() {
    if (this.exclusive || this.closed) return;
    for (let index = 0; index < this.pending.length;) {
      const request = this.pending[index];
      const key = request.connectionId;
      if (key === undefined && this.active.size) break;
      if (key !== undefined && this.active.has(key)) {
        index++;
        continue;
      }
      this.pending.splice(index, 1);
      request.cleanup();
      if (key === undefined) this.exclusive = true;
      else this.active.add(key);
      let released = false;
      request.grant(() => {
        if (released) return;
        released = true;
        if (key === undefined) this.exclusive = false;
        else this.active.delete(key);
        this.pump();
        if (!this.exclusive && !this.active.size)
          for (const done of this.idle) done();
      });
      if (this.exclusive) break;
    }
  }

  async close() {
    this.closed = true;
    for (const request of this.pending.splice(0)) {
      request.cleanup();
      request.reject(new Error("Browser is shutting down"));
    }
    if (this.exclusive || this.active.size)
      await new Promise<void>((resolve) => this.idle.add(resolve));
    this.idle.clear();
  }
}
