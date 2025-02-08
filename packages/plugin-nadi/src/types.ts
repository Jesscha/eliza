import { z } from "zod";

export interface TweetContent {
    text: string;
}

export const TweetSchema = z.object({
    text: z.string().describe("The text of the tweet"),
});

export const ReviewSchema = z.object({
    document: z.string().describe("The document id of the tweet"),
    content: z.string().describe("The content of the tweet"),
    authorId: z.string().describe("The author id of the tweet"),
    reason: z.string().describe("The reason of the tweet"),
    approved: z.boolean().describe("Whether the sentence is approved or not"),
});

export const isTweetContent = (obj: any): obj is TweetContent => {
    return TweetSchema.safeParse(obj).success;
};
