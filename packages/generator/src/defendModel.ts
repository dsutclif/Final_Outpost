// The model lives in @fo/bots since defend S3 (the judgment bots read it); the generator keeps importing it from here.
export { DEFEND_FIT, defendInput, predictRho, modelBreak, fitEta } from "@fo/bots";
export type { DefendFit, DefendInput, DefendResult, ModelStrategy, PredictOptions, ModelBreak } from "@fo/bots";
