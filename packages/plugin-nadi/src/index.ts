import { Plugin } from "@elizaos/core";
import { reviewAction } from "./actions/review";

export const nadiPlugin: Plugin = {
    name: "nadi",
    description: "Nadi specific features",
    actions: [reviewAction],
    evaluators: [],
    providers: [],
};

export default nadiPlugin;
