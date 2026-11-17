import { describe, expect, it } from "vitest";
import { TitleBackdrop } from "../src/title.js";

// Autoplay refused (iOS low power mode): the first tap must start the loop, once.
describe("title loop autoplay refusal", () => {
  it("retries play on the first pointerdown and not again", async () => {
    const handlers: Record<string, () => void> = {};
    const doc = { addEventListener: (t: string, f: () => void) => { handlers[t] = f; }, removeEventListener: (t: string) => { delete handlers[t]; } };
    let plays = 0;
    const video = { play: () => (++plays === 1 ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve()) };
    const self = { host: { ownerDocument: doc }, video };
    (TitleBackdrop.prototype as unknown as { tryPlay(v: unknown): void }).tryPlay.call(self, video);
    await Promise.resolve(); await Promise.resolve();
    expect(handlers["pointerdown"]).toBeTypeOf("function");
    handlers["pointerdown"]!();
    expect(plays).toBe(2);
    expect(handlers["pointerdown"]).toBeUndefined();
  });
});
