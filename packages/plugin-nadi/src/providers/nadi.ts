import { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { extractSentences } from "../utils/firebase";

const nadiProvider: Provider = {
    get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
        const nadiRes = await fetch(
            "https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/sentences",
            {
                method: "GET",
            }
        );
        const nadiSentences = extractSentences(await nadiRes.json());
        const insights = nadiSentences
            .map((sentence, index) => {
                return `${index + 1}. "${sentence}"`;
            })
            .join("\n");

        console.log(nadiSentences);

        return `Here are some recent conversations from Nadi:\n\n${insights}\n\nThese are messages that people have shared in the Nadi community.`;
    },
};
export { nadiProvider };
