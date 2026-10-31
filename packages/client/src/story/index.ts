import type { Skin } from "@fo/skins";
import { StoryDirector, type StoryHost } from "./director.js";
import { createStoryView } from "./view.js";

export { StoryDirector } from "./director.js";

/** The director for a level, or null when this skin has no story data for it (every generated level). */
export function directorFor(skin: Skin, levelId: string, shell: HTMLElement, host: StoryHost, replay: boolean): StoryDirector | null {
  const story = skin.story, level = story?.levels[levelId];
  if (!story || !level) return null;
  return new StoryDirector(story, level, createStoryView(shell, { dialogue: story.dialogue, tapLabel: story.ui.tapToContinue }), host, replay);
}
