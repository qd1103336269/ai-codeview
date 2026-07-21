export type AppErrorCode =
  | "GIT_NOT_FOUND"
  | "NO_DIFF"
  | "INVALID_CONFIG"
  | "INVALID_CLI_INPUT"
  | "INVALID_PATH_INPUT"
  | "PATH_NOT_FOUND"
  | "PATH_OUTSIDE_CWD"
  | "FILE_TOO_LARGE"
  | "MISSING_API_KEY"
  | "SECRET_DETECTED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_BAD_REQUEST"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "AI_RESPONSE_INVALID"
  | "OUTPUT_WRITE_FAILED"
  | "GIT_ADD_FAILED"
  | "GIT_COMMIT_FAILED"
  | "GIT_PUSH_FAILED"
  | "GIT_STATUS_FAILED"
  | "PUSH_NO_UPSTREAM"
  | "PUSH_FAILED_ALREADY_COMMITTED"
  | "EMPTY_COMMIT_MESSAGE"
  | "USER_CANCELLED"
  | "INTERACTION_FAILED"
  | "UNKNOWN_ERROR";

export type AppExitCode = 0 | 1 | 2;

export interface AppErrorInput {
  code: AppErrorCode;
  message: string;
  exitCode: AppExitCode;
  suggestion?: string;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly exitCode: AppExitCode;
  readonly suggestion?: string;
  readonly details?: unknown;

  constructor(input: AppErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "AppError";
    this.code = input.code;
    this.exitCode = input.exitCode;
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
    details: error,
  });
}
