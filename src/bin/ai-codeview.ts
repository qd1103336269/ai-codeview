import { createProgram } from "../cli/create-program.js";

await createProgram().parseAsync(process.argv);
