import { deepseekFactory } from "./deepseek-provider.js";
import { openaiFactory } from "./openai-provider.js";
import { registerProvider } from "./registry.js";

registerProvider("deepseek", deepseekFactory);
registerProvider("openai", openaiFactory);
