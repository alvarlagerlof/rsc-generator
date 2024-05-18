"use server";

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createStreamableValue } from "ai/rsc";

export async function generateRsc(
  prompt: string,
  {
    previousPrompt,
    previousRscPayload,
  }: {
    previousPrompt: string | null;
    previousRscPayload: string | null;
  },
) {
  const stream = createStreamableValue("");

  console.log("Generating RSC payload");
  (async () => {
    const { textStream } = await streamText({
      model: openai("gpt-4o"),
      seed: 1,
      messages: [
        {
          role: "system",
          content: `
        You are a program writing react RSC payloads. It's a special format expressing react components.
        The format is very specific, so the response has to be exavtly correct, or it won't be parseable.
        There may be a lost of nested brackets. All of them have to have an equivalent closing bracket.

        Example code is wrapped with three double quotes like this:
        """example text here""". These tripple quotes are not part of the code and should be removed.

        html:
        """<h2>Test!</h2>"""

        RSC payload:
        """0:["$","h2",null,{"children":"Test"}]\n"""

        The RSC payloads can also be nested like this:
        """0:[["$","h1",null,{"children":"Testing!"}],["$","h1",null,{"children":"Testing!"}]]\n"""

        You can also add other props like classNames like this. Tailwind can be used for this.
        """0:[["$","h1",null,{"children":"Testing!","className":"mb-4"}],["$","h1",null,{"children":"Testing!"}]]\n"""

        You can nest elements inside of other by adding them as children. Here's an example:
        """0:[["$","div",null,{"children":["$","h1",null,{"children":"Testing!"}]}]]\n"""

        It's important that you always reply in the RSC payload format. The payload always has to be complete and have the same number of opening and closing brackets. Respond without newlines.`,
        },
        {
          role: "system",
          content: `
          This is what the user asked for previously:

          Previous prompt:
          """${previousPrompt}""""

          Previous resulting RSC payload:
          """${previousRscPayload}""""

          You can use this as a reference when generating the new RSC payload, but make sure that the new payload is still valid.`,
        },
        {
          role: "system",
          content:
            "When generating responses, you may want to include image. You can use https://source.unsplash.com/random/200x200?sig=1 and use a random number for the sig parameter. ONLY use images when the user specifically asks for it. Do not use them otherwise.",
        },
        {
          role: "system",
          content: `.
          Example of a payload (do not return the tripple double quotes):
          """0:["$","h2",null,{"children":"Test"}]\n"""

          Do not wrap the response in backticks or """ Make sure that the response ALWAYS starts with """0:""" and ALWAYS ENDS with a newline like """\n""". The newline at the end is especially important for the parsing to work.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    for await (const delta of textStream) {
      console.log("Delta", delta);
      // await new Promise((resolve) => setTimeout(resolve, 100));
      stream.update(delta);
    }

    stream.done();
  })();

  return { output: stream.value };
}
