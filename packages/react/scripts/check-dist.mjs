// Imports the published build the way Node does, with no bundler to paper over missing extensions.
// 0.1.0 shipped `import "./submit"` without ".js" and failed exactly here.
const mod = await import(new URL("../dist/index.js", import.meta.url));
const expected = ["useForm", "ValidationError", "SubmissionError", "endpointFor", "submit", "DEFAULT_ENDPOINT"];
const missing = expected.filter((name) => !(name in mod));
if (missing.length) {
  console.error(`dist is missing exports: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`dist loads in Node ESM with ${expected.length} exports`);
