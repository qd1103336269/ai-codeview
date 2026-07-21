import { CommanderError } from "commander";
import { createProgram } from "../cli/create-program.js";
import { AppError, isAppError } from "../errors/app-error.js";

process.on("unhandledRejection", (error) => {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
    process.exit(process.exitCode);
  }
  const appError = isAppError(error) ? error : new AppError({
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "工具运行时发生未知错误。",
    exitCode: 2,
    cause: error,
  });
  process.stderr.write(`${appError.message}\n`);
  process.exitCode = appError.exitCode;
  process.exit(process.exitCode);
});

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
  } else {
    const appError = isAppError(error) ? error : new AppError({
      code: "UNKNOWN_ERROR",
      message: error instanceof Error ? error.message : "工具运行时发生未知错误。",
      exitCode: 2,
      cause: error,
    });
    process.stderr.write(`${appError.message}\n`);
    process.exitCode = appError.exitCode;
  }
}

process.exit(process.exitCode ?? 0);
