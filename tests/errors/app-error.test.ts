import { describe, expect, test } from "vitest";
import { AppError, isAppError, toAppError } from "../../src/errors/app-error.js";

describe("AppError", () => {
  test("preserves known app errors", () => {
    const error = new AppError({
      code: "MISSING_API_KEY",
      message: "缺少 DEEPSEEK_API_KEY",
      exitCode: 2,
      suggestion: "请先设置 DEEPSEEK_API_KEY，再运行 review。",
    });

    expect(isAppError(error)).toBe(true);
    expect(toAppError(error)).toBe(error);
    expect(error.suggestion).toBe("请先设置 DEEPSEEK_API_KEY，再运行 review。");
  });

  test("wraps unknown errors without leaking internals by default", () => {
    const error = toAppError(new Error("raw stack details"));

    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.exitCode).toBe(2);
    expect(error.message).toBe("工具运行时发生未知错误。");
  });
});
