export function parseFirstJsonDocument(output) {
  const start = output.search(/[\[{]/);
  if (start === -1) {
    throw new SyntaxError("Wrangler output contains no JSON document");
  }

  const stack = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const character = output[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "[" || character === "{") {
      stack.push(character);
    } else if (character === "]" || character === "}") {
      const opening = stack.pop();
      const matches =
        (opening === "[" && character === "]") ||
        (opening === "{" && character === "}");
      if (!matches) {
        throw new SyntaxError("Wrangler output contains malformed JSON");
      }
      if (stack.length === 0) {
        return JSON.parse(output.slice(start, index + 1));
      }
    }
  }

  throw new SyntaxError("Wrangler output contains incomplete JSON");
}
