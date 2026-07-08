export type AppErrorCode =
  | "NOT_GIT_REPOSITORY"
  | "GIT_NOT_FOUND"
  | "NO_DIFF"
  | "INVALID_CONFIG"
  | "INVALID_PATH_INPUT"
  | "PATH_NOT_FOUND"
  | "MISSING_API_KEY"
  | "SECRET_DETECTED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_BAD_REQUEST"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "DIFF_TOO_LARGE"
  | "AI_RESPONSE_INVALID"
  | "OUTPUT_WRITE_FAILED"
  | "GIT_COMMIT_FAILED"
  | "GIT_PUSH_FAILED"
  | "UNKNOWN_ERROR";

export type AppExitCode = 0 | 1 | 2;

export interface AppErrorInput {
  code: AppErrorCode;
  message: string;
  exitCode: AppExitCode;
  recoverable: boolean;
  suggestion?: string;
  details?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly exitCode: AppExitCode;
  readonly recoverable: boolean;
  readonly suggestion?: string;
  readonly details?: unknown;

  constructor(input: AppErrorInput) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.exitCode = input.exitCode;
    this.recoverable = input.recoverable;
    this.suggestion = input.suggestion;
    this.details = input.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  return new AppError({
    code: "UNKNOWN_ERROR",
    message: "工具运行时发生未知错误。",
    exitCode: 2,
    recoverable: false,
    details: error,
  });
}
