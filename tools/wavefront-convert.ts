// outpost-ops#202: the converter lives in the generator now (build.ts runs it); tools keep importing it from here.
export { convert, type Converted } from "../packages/generator/src/wavefrontConvert.js";
