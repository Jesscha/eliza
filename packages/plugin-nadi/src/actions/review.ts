import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    composeContext,
    elizaLogger,
    ModelClass,
    generateObject,
    truncateToCompleteSentence,
} from "@elizaos/core";
import { Scraper } from "agent-twitter-client";
import { reviewTemplate2, tweetTemplate } from "../templates";
import { isTweetContent, ReviewSchema, TweetSchema } from "../types";

export const DEFAULT_MAX_TWEET_LENGTH = 280;

async function fetchCandidateSentences() {
    const nadiRes = (await fetch(
        "https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/sentences_candidates",
        {
            method: "GET",
        }
    ).then((res) => res.json())) as {
        documents: {
            name: string; // Contains the full path including document ID
            fields: any;
        }[];
    };
    return JSON.stringify(
        nadiRes.documents.map((doc) => ({
            document: doc.name.split("/").pop(), // Extract the ID from the full path
            content: doc.fields.content?.stringValue || "",
            authorId: doc.fields.authorId?.stringValue || "",
        }))
    );
}

async function composeTweet(
    runtime: IAgentRuntime,
    _message: Memory,
    state?: State
): Promise<string> {
    try {
        const context = composeContext({
            state,
            template: tweetTemplate,
        });

        // console.log(context);

        const tweetContentObject = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
            schema: TweetSchema,
            stop: ["\n"],
        });

        if (!isTweetContent(tweetContentObject.object)) {
            elizaLogger.error(
                "Invalid tweet content:",
                tweetContentObject.object
            );
            return;
        }

        let trimmedContent = tweetContentObject.object.text.trim();

        // Truncate the content to the maximum tweet length specified in the environment settings.
        const maxTweetLength = runtime.getSetting("MAX_TWEET_LENGTH");
        if (maxTweetLength) {
            trimmedContent = truncateToCompleteSentence(
                trimmedContent,
                Number(maxTweetLength)
            );
        }

        return trimmedContent;
    } catch (error) {
        elizaLogger.error("Error composing tweet:", error);
        throw error;
    }
}

async function sendTweet(twitterClient: Scraper, content: string) {
    const result = await twitterClient.sendTweet(content);

    const body = await result.json();
    elizaLogger.log("Tweet response:", body);

    // Check for Twitter API errors
    if (body.errors) {
        const error = body.errors[0];
        elizaLogger.error(
            `Twitter API error (${error.code}): ${error.message}`
        );
        return false;
    }

    // Check for successful tweet creation
    if (!body?.data?.create_tweet?.tweet_results?.result) {
        elizaLogger.error("Failed to post tweet: No tweet result in response");
        return false;
    }

    return true;
}

async function postTweet(
    runtime: IAgentRuntime,
    content: string
): Promise<boolean> {
    try {
        const twitterClient = runtime.clients.twitter?.client?.twitterClient;
        const scraper = twitterClient || new Scraper();

        if (!twitterClient) {
            const username = runtime.getSetting("TWITTER_USERNAME");
            const password = runtime.getSetting("TWITTER_PASSWORD");
            const email = runtime.getSetting("TWITTER_EMAIL");
            const twitter2faSecret = runtime.getSetting("TWITTER_2FA_SECRET");

            if (!username || !password) {
                elizaLogger.error(
                    "Twitter credentials not configured in environment"
                );
                return false;
            }
            // Login with credentials
            await scraper.login(username, password, email, twitter2faSecret);
            if (!(await scraper.isLoggedIn())) {
                elizaLogger.error("Failed to login to Twitter");
                return false;
            }
        }

        // Send the tweet
        elizaLogger.log("Attempting to send tweet:", content);

        try {
            if (content.length > DEFAULT_MAX_TWEET_LENGTH) {
                const noteTweetResult = await scraper.sendNoteTweet(content);
                if (
                    noteTweetResult.errors &&
                    noteTweetResult.errors.length > 0
                ) {
                    // Note Tweet failed due to authorization. Falling back to standard Tweet.
                    return await sendTweet(scraper, content);
                } else {
                    return true;
                }
            } else {
                return await sendTweet(scraper, content);
            }
        } catch (error) {
            throw new Error(`Note Tweet failed: ${error}`);
        }
    } catch (error) {
        // Log the full error details
        elizaLogger.error("Error posting tweet:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
            cause: error.cause,
        });
        return false;
    }
}
export const reviewAction: Action = {
    name: "REVIEW2",
    similes: ["REVIEW", "CHECK", "EXAMINE"],
    description: "Review and analyze content from Nadi",
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        try {
            setInterval(async () => {
                const candidates = await fetchCandidateSentences();
                const context = composeContext({
                    state: {
                        ...state,
                        candidates,
                    },
                    template: reviewTemplate2,
                });

                console.log(candidates);
                console.log(context);

                const reviewObject = (await generateObject({
                    runtime,
                    context,
                    modelClass: ModelClass.SMALL,
                    schema: ReviewSchema,
                })) as any;
                console.log(reviewObject.object);

                try {
                    if (reviewObject.object.approved) {
                        const response = await fetch(
                            "https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/reviews",
                            {
                                method: "POST",
                                body: JSON.stringify({
                                    fields: {
                                        content: {
                                            stringValue:
                                                reviewObject.object.content,
                                        },
                                        authorId: {
                                            stringValue:
                                                reviewObject.object.authorId,
                                        },
                                        reason: {
                                            stringValue:
                                                reviewObject.object.reason,
                                        },
                                        timestamp: {
                                            timestampValue:
                                                new Date().toISOString(),
                                        },
                                    },
                                }),
                            }
                        );

                        if (!response.ok) {
                            elizaLogger.error(
                                "Failed to save review:",
                                await response.json()
                            );
                        }
                        // post tweet about what is approved and why

                        const tweetContent = await composeTweet(
                            runtime,
                            message,
                            {
                                ...state,
                                sentence: reviewObject.object.content,
                                reason: reviewObject.object.reason,
                            }
                        );

                        console.log(tweetContent);
                    } else {
                        // post tweet about what is not approved and why
                    }
                    // const deleteResponse = await fetch(
                    //     `https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/sentences_candidates/${reviewObject.object.document}`,
                    //     {
                    //         method: "DELETE",
                    //     }
                    // );

                    // console.log(
                    //     deleteResponse,
                    //     "deleteResponse : ",
                    //     reviewObject.object.document
                    // );

                    // if (!deleteResponse.ok) {
                    //     elizaLogger.error(
                    //         "Failed to delete review:",
                    //         await deleteResponse.json()
                    //     );
                    // }
                } catch (error) {
                    elizaLogger.error(
                        "Error saving review to Firestore:",
                        error
                    );
                }
            }, 5000);
            // const nadiRes = await fetch(
            //     "https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/sentences",
            //     {
            //         method: "GET",
            //     }
            // );
            // const nadiSentences = extractSentences(await nadiRes.json());

            // if (nadiSentences.length === 0) {
            //     elizaLogger.log("No new Nadi content to review");
            //     return false;
            // }

            // elizaLogger.log("Found Nadi content to review:", nadiSentences);
            return true;
        } catch (error) {
            elizaLogger.error("Error reviewing Nadi content:", error);
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Review Nadi content" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Reviewing latest content from Nadi community",
                    action: "REVIEW",
                },
            },
        ],
    ],
};
