import type { QuestionPreparation } from "../../../shared/focus-search-contracts";
import type { Language } from "../../../shared/language";

/** One topic owns each language's preparation, including its failure budget. */
export class QuestionPreparationPool {
  private pending = new Map<
    Language,
    { controller: AbortController; promise: Promise<string> }
  >();

  constructor(
    private signal: AbortSignal,
    private read: (language: Language) => QuestionPreparation | undefined,
    private save: (
      language: Language,
      result: QuestionPreparation,
    ) => Promise<void>,
    private translate: (
      language: Language,
      signal: AbortSignal,
    ) => Promise<string>,
  ) {}

  async get(language: Language, consumer: AbortSignal): Promise<string> {
    consumer.throwIfAborted();
    this.signal.throwIfAborted();
    const saved = this.read(language);
    if (saved?.state === "ready") return saved.question;
    if (saved?.state === "failed") throw new Error(saved.error);
    let entry = this.pending.get(language);
    if (!entry) {
      const controller = new AbortController();
      entry = {
        controller,
        promise: this.prepare(
          language,
          AbortSignal.any([this.signal, controller.signal]),
        ),
      };
      this.pending.set(language, entry);
    }
    const shared = entry.promise;
    return new Promise<string>((resolve, reject) => {
      const cancel = () => {
        consumer.removeEventListener("abort", cancel);
        reject(new Error("cancelled"));
      };
      consumer.addEventListener("abort", cancel, { once: true });
      shared.then(
        (question) => {
          consumer.removeEventListener("abort", cancel);
          resolve(question);
        },
        (error) => {
          consumer.removeEventListener("abort", cancel);
          reject(error);
        },
      );
      if (consumer.aborted) cancel();
    });
  }

  cancelUnused(languages: Set<Language>) {
    for (const [language, entry] of this.pending)
      if (!languages.has(language)) entry.controller.abort();
  }

  async drain() {
    await Promise.allSettled([...this.pending.values()].map((e) => e.promise));
  }

  private async prepare(language: Language, signal: AbortSignal) {
    try {
      signal.throwIfAborted();
      await this.save(language, { state: "preparing" });
      signal.throwIfAborted();
      const question = await this.translate(language, signal);
      signal.throwIfAborted();
      if (!question.trim())
        throw new Error("Question translation check failed");
      await this.save(language, { state: "ready", question });
      signal.throwIfAborted();
      return question;
    } catch (error) {
      await this.save(language, {
        state: "failed",
        error:
          (error instanceof Error ? error.message : String(error)).slice(
            0,
            1000,
          ) || "Question translation check failed",
      });
      throw error;
    }
  }
}
