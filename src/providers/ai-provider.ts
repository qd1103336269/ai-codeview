import type { ReviewReport } from "../review/review-schema.js";

export interface ReviewRequest {
  prompt: string;
}

export interface AiProvider {
  review(request: ReviewRequest): Promise<ReviewReport>;
}
