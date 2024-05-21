"use server";

import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { createStreamableValue } from "ai/rsc";

export async function generateRsc(
  prompt: string,
  {
    previousPrompt,
    previousRscPayload,
  }: {
    previousPrompt: string | null;
    previousRscPayload: string | null;
  }
) {
  const { text: plan } = await generateText({
    model: openai("gpt-4o"),
    seed: 1,
    messages: [
      {
        role: "system",
        content: `
          You are a program that helps creating websites based on user input.
          This part of the program is the planning phrase for what later becomes html.
          Your job is to plan content and a loose structure to be used in further generation.
          Also include hints about suggested styling and layout.
          If the prompt mentions a real brand, include their colors and style.
          Be careful not to make menus with too many items. Keep it simple.
          Keep in mind that order and nesting matters.
          Do not respond with any questions. Only respond with answers expanding on the user propmpt.
          Only create content for a single page. Do not plan for multiple pages.

          Previous prompt:
          """${previousPrompt}""""
          `,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  console.log("Plan", plan);

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
        The format is very specific, so the response has to be exavtly correct, or it won't be parsable.
        There may be a lost of nested brackets. All of them have to have an equivalent closing bracket.

        Example code is wrapped with three double quotes like this:
        """example text here""". These tripple quotes are not part of the code and should be removed.

        # html
        Example:
        """<h2>Test!</h2>"""

        # RSC payload
        Example:
        """0:["$","h2",null,{"children":"Test"}]\n"""
        - The """null""" after the element type is important and should NOT be omitted ever.

        # Comments
        Examples:
        """f0:|"$","template",null,{"children":"This is the header"}]\n"""
        """f1:|"$","template",null,{"children":"This is the footer, it should be dark"}]\n"""
        - It's important that comments use the """template""" element type so that they aren't visible in the UI.
        - Make sure that the line id is something that isn't referenced by any other line.
        - These are crucial to explain the structure and important details such as styling as you go. Replace the content with an actual comment.
        - These MUST be added anywhere in the RSC payload to explain the structure, or the generation be good.
        - Comments are ONLY USEFUL if they are on the line before the element they are explaining. They are not useful at the end of the payload.
        - Comments to not replace actual UI.
        - Add comments where you think it would be useful to explain the structure of the UI.
        - Start the response with a few comments explaining the overall goal of the UI.

        # Props
        Example:
        """0:[["$","h1",null,{"children":"Testing!","className":"mb-4"}],["$","h1",null,{"children":"Testing!"}]]\n"""
        - Tailwind can be used for this.


        # Arrays:
        Example:
        """0:[["$","h1",null,{"children":"Testing!"}],["$","h1",null,{"children":"Testing!"}]]\n"""


        # Nesting elements:
        Example:
        """0:[["$","div",null,{"children":["$","h1",null,{"children":"Testing!"}]}]]\n"""

        # Line references (to split the payload into parts)
        Examples:
        """0:["$","div",null,{"children":"$L1"}]\n1:["$","h2",null,{"children":"Test"}]\n"""
        """0:["$","nav",null,{"children":"$L1"}]\n1:["$","ul",null,{"children":[["$","li",null,{"children":"item"}],["$","li",null,{"children":"item 2"}]]}]\n"""
        - Please note the """$L1"""". It is a reference to another line. This number has to be correct.
        - For example, a header or a footer may have their own line references to separate lines.
        - This lets you think step-by-step and generate small sections at at time.
        - Use them to avoid problems with matching closing brackets.
        - EVEN if the response is short, ALWAYS do use line references.
        - Do not make the lines short. It will make it harder to the the styling right.
        - All lines MUST be referenced by other lines except for """0:""" and comments ("""template""" / """f0"""). Otherwise all of the UI won't show up.

        The response should be structured like this:

        f0: (comment)
        f1: (comment)
        f2: (comment)
        (as many as needed)
        0: (actual UI)
        1: (actual UI)
        2: (actual UI)
        (as many as needed)

        It's important that you always reply in the RSC payload format. The payload always has to be complete and have the same number of opening and closing brackets. Respond without newlines.`,
        },
        {
          role: "system",
          content: `
          This is what the user asked for previously:

          Previous resulting RSC payload:
          """${previousRscPayload}""""

          You can use this as a guide when generating the new RSC payload, but make sure that the new payload is still valid.
          Making use of line references to split the payload into multiple lines may help when improving a generation.`,
        },
        {
          role: "system",
          content: `
            When generating responses, you may want to include image.
            You can use https://source.unsplash.com/random/200x200?sig=1 and use a random number for the sig parameter.
            ONLY use images when the user specifically asks for it. Do not use them otherwise.

            There are also company logos available. You can use them like this:
            https://logo.clearbit.com/:domain
            `,
        },
        {
          role: "system",
          content: `
          Always make the result as pretty and realistic as possible by styling with Tailwind classNames.
          Strive for a minimal and muted design.
          Do not simplify or leave content unfinished like placeholders. Everything should look real.
          BANNED STYLES:
          - The """style""" prop
          - The Tailwind """fixed""" className ("""position: fixed;""")

          Keep in mind that the output screen size is a very small laptop. DO not use classNames like """min-h-screen""".
          If the user is unclear, do expand into something that would appear on the the web.
          `,
        },
        {
          role: "system",
          content: `.
          Example of a payload (do not return the tripple double quotes):
          """0:["$","h2",null,{"children":"Test"}]\n"""

          DO NOT wrap the response in \`\`\` or """. NO BACKTICKS. Make sure that the response ALWAYS starts with """0:""" and ALWAYS ENDS with a newline like """\n""". The newline at the end is especially important for the parsing to work.`,
        },
        {
          role: "user",
          content: plan,
        },
      ],
    });

    for await (const delta of textStream) {
      //console.log("Delta", delta);
      //await new Promise((resolve) => setTimeout(resolve, 50));
      stream.update(delta);
    }

    stream.done();
  })();

  return { output: stream.value };
}
