import { Plugin } from "@elizaos/core";
import { nadiProvider } from "./providers/nadi";

export * as actions from "./actions";
export * as evaluators from "./evaluators";
export * as providers from "./providers";

export const nadiPlugin: Plugin = {
    name: "nadi",
    description: "Nadi plugin",
    actions: [],
    evaluators: [],
    providers: [nadiProvider],
};
export default nadiPlugin;
