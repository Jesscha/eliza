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
import { reviewTemplate, tweetTemplate } from "../templates";
import { isTweetContent, ReviewSchema, TweetSchema } from "../types";

export const DEFAULT_MAX_TWEET_LENGTH = 280;

async function fetchCandidateSentences() {
    const nadiRes = (await fetch(
        "https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/sentences_candidates",
        {
            method: "GET",
        }
    ).then((res) => res.json())) as {
        documents?: {
            name: string; // Contains the full path including document ID
            fields: any;
        }[];
    };

    if (!nadiRes.documents) {
        elizaLogger.error("No candidate sentences found");
        return false;
    }

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

async function getFirebaseAuthToken(runtime: IAgentRuntime) {
    const API_KEY = runtime.getSetting("FIREBASE_API_KEY");
    const email = runtime.getSetting("FIREBASE_AUTH_EMAIL");
    const password = runtime.getSetting("FIREBASE_AUTH_PASSWORD");

    elizaLogger.log("API_KEY:", API_KEY);
    elizaLogger.log("email:", email);
    elizaLogger.log("password:", password);
    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
        {
            method: "POST",
            body: JSON.stringify({
                email,
                password,
                returnSecureToken: true,
            }),
        }
    );

    const data = await response.json();

    elizaLogger.log("data:", data);
    return data.idToken;
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
    name: "NADI_REVIEW",
    similes: ["NADI_REVIEW", "REVIEW_NADI", "CHECK_NADI", "EXAMINE_NADI"],
    description: "Review and analyze content specifically from Nadi platform",
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ) => {
        const username = runtime.getSetting("TWITTER_USERNAME");
        const password = runtime.getSetting("TWITTER_PASSWORD");

        if (!username || !password) {
            elizaLogger.error("Twitter credentials not configured");
            return false;
        }
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        try {
            const reviewNadiContent = async () => {
                const candidates = await fetchCandidateSentences();
                if (!candidates) {
                    elizaLogger.error("No candidate sentences found");
                    return;
                }
                const context = composeContext({
                    state: {
                        ...state,
                        candidates,
                    },
                    template: reviewTemplate,
                });
                const reviewObject = (await generateObject({
                    runtime,
                    context,
                    modelClass: ModelClass.SMALL,
                    schema: ReviewSchema,
                })) as {
                    object: {
                        approved: boolean;
                        content: string;
                        authorId: string;
                        reason: string;
                        document: string;
                    };
                };
                try {
                    if (reviewObject.object.approved) {
                        const authToken = await getFirebaseAuthToken(runtime);
                        elizaLogger.log("Auth token:", authToken);

                        const response = await fetch(
                            "https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/sentences",
                            {
                                method: "POST",
                                headers: {
                                    Authorization: `Bearer ${authToken}`,
                                    "Content-Type": "application/json",
                                },
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
                            const errorData = await response.text();
                            elizaLogger.error(
                                `Failed to create document: ${errorData}`
                            );
                            throw new Error(
                                `Failed to create document: ${response.status}`
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

                        await postTweet(runtime, tweetContent);
                        const deleteResponse = await fetch(
                            `https://firestore.googleapis.com/v1/projects/nadi-c7a96/databases/(default)/documents/sentences_candidates/${reviewObject.object.document}`,
                            {
                                method: "DELETE",
                            }
                        );

                        if (!deleteResponse.ok) {
                            elizaLogger.error(
                                "Failed to delete review:",
                                await deleteResponse.json()
                            );
                        }
                    } else {
                        elizaLogger.log(
                            "Review not approved:",
                            reviewObject.object
                        );
                    }
                } catch (error) {
                    elizaLogger.error(
                        "Error saving review to Firestore:",
                        error
                    );
                }
            };

            await reviewNadiContent();

            setInterval(reviewNadiContent, 60 * 60 * 1000);

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
                content: { text: "/nadi_review" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Reviewing latest content from Nadi community",
                    action: "NADI_REVIEW",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: { text: "Review Nadi content" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Reviewing latest content from Nadi community",
                    action: "NADI_REVIEW",
                },
            },
        ],
    ],
};
