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
  // const { text: plan } = await generateText({
  //   model: openai("gpt-4o"),
  //   seed: 1,
  //   messages: [
  //     {
  //       role: "system",
  //       content: `
  //         You are a program that helps creating websites based on user input.
  //         This part of the program is the planning phrase for what later becomes html.
  //         Your job is to plan content and a loose structure to be used in further generation.
  //         Also include hints about suggested styling and layout.
  //         If the prompt mentions a real brand, include their colors and style.
  //         Be careful not to make menus with too many items. Keep it simple.
  //         Keep in mind that order and nesting matters.
  //         Do not respond with any questions. Only respond with answers expanding on the user propmpt.
  //         Only create content for a single page. Do not plan for multiple pages.

  //         Previous prompt:
  //         ${previousPrompt}"
  //         `,
  //     },
  //     {
  //       role: "user",
  //       content: prompt,
  //     },
  //   ],
  // });

  // console.log("Plan", plan);

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
You are a website generator program split into two parts. First, you will generate a LONG (500 words) AND DETAILED plan for the user's request.
Don't just write that the plan is long and detailed. Actually do it.
Show, don't tell. Write the plan in detail.
The plan will be used to generate the actual response using the RSC program.
The plan fully HAS TO BE outputted as RSC comments #Plan (template tags starting with f0) in the RSC payload.
There should be at least f1000 to f1030 lines of long comments of the plan in the beginning of the RSC payload, then there should be more comments in between as the response is generated.
The UI HAS TO BE outputted without f references.

One program can use another program. For example, the RSC program can use the Plan program to generate parts of the plan inline.
          `,
        },
        {
          role: "system",
          content: `
# Plan program
You are a program that helps creating websites based on user input.
This part of the program is the planning phrase for what later becomes html.
Your job is to plan content and a loose structure to be used in further generation.
Also include detailed suggestions about styling and layout.
The plan is incredibly important in the beginning of the generation. It will help steer the overall result.
If the prompt mentions a real brand, include their colors and style.
Be careful not to make menus with too many items. Keep it simple.
Keep in mind that order and nesting matters.
Do not respond with any questions. Only respond with answers expanding on the user prompt.
Only create content for a single page. Do not plan for multiple pages.
Correct flexbox order matters a lot.
When you see example content, it should only be taken as an loose guide. Always add WAY WAY WAY more text and details everywhere always.
Write ling descriptions expanding on the user prompt.

fully featured and with real content, pretend that it's a real website. No lorem ipsum or placeholders. Pretend that you're a HTTP server. TONS OF CONTENT. MAKE SEEM REAL. Only do this if it makes sense though, for examples like the google home page, the page should be very minimal
        `,
        },
        {
          role: "system",
          content: `
# RSC program
You are a program writing react RSC payloads. It's a special format expressing react components.
The format is very specific, so the response has to be exavtly correct, or it won't be parsable.
There may be a lost of nested brackets. All of them have to have an equivalent closing bracket.

# html
Example:
<h2>Test!</h2>

# RSC payload
Example:
0:["$","h2",null,{"children":"Test"}]\n
- The null after the element type is important and should NOT be omitted ever.

# Comments
Examples:
f1000:"$","template",null,{"children":"Use the # Plan program"}]\n
f1002:"$","template",null,{"children":"This is the header for the page, it is minimalistic and dark. (add more text here)"}]\n
f1003:"$","template",null,{"children":"This is the footer, it should be dark to match the header."}]\n
- It's important that comments use the template element type so that they aren't visible in the UI.
- Make sure that the line id is something that isn't referenced by any other line.
- These are crucial to explain the structure and important details such as styling as you go. Replace the content with an actual comment.
- These MUST be added anywhere in the RSC payload to explain the structure, or the generation be good.
- Comments are ONLY USEFUL if they are on the line before the element they are explaining. They are not useful at the end of the payload.
- Comments to not replace actual UI.
- Add comments where you think it would be useful to explain the structure of the UI.
- Start the response with a few comments explaining the overall goal of the UI.
- Make sure that comments are longer
- Only use the f marker for comments.

# Props
Example:
0:[["$","h1",null,{"children":"Testing!","className":"mb-4"}],["$","h1",null,{"children":"Testing!"}]]\n
- Tailwind can be used for this.


# Arrays
Example:
0:[["$","h1",null,{"children":"Testing!"}],["$","h1",null,{"children":"Testing!"}]]\n


# Nesting elements
Example:
0:["$","h1",null,{"classname:"mb-3","children":"Testing!"}]\n
0:[["$","div",null,{"classname":"p-5","children":["$","h1",null,{"className":"mb-4","children":"Testing!"}]}]]\n
- Be careful about not placing the the closing brackets } too early. It will break the parsing. This is incorrect.
0:["$","div",null,{"className":"flex flex-col items-center justify-center min-h-screen bg-white"},"children":"$L1"]


# Line references (to split the payload into parts)
Examples:
0:["$","div",null,{"className":"flex flex-col min-h-full","children":["$L1","$L2","$L3"]}]\n
0:["$","div",null,{"className:"p-2","children":"$L1"}]\n1:["$","h2",null,{"children":"Test"}]\n
0:["$","nav",null,{"className:"p-2","children":"$L1"}]\n1:["$","ul",null,{"children":[["$","li",null,{"className:"p-2","children":"item"}],["$","li",null,{"children":"item 2"}]]}]\n
- Please note the $L1". It is a reference to another line. This number has to be correct.
- For example, a header or a footer may have their own line references to separate lines.
- This lets you think step-by-step and generate TINY SHORT chunks at a time. EXTREMELY SHORT. AS SHORT AS POSSIBLE. NO LONGER THAN 100 CHARACTERs IDEALLY. Break apart lists into smaller chunks. Maybe just a simple element per line.
- Use them to avoid problems with matching closing brackets.
- EVEN if the response is short, ALWAYS do use line references.
- Line 0 MUST reference other lines. Otherwise the UI won't BE VISIBLE.
- DO NOT FORGET TO CLOSE THE BRACKETS!'
- Do not make the lines short. It will make it harder to the the styling right.
- Make sure that the references point to the correct line. Otherwise the UI will show up in the wrong place, like the main content inside the header.
- All lines MUST BE REFERENCED by OTHER LINES except for 0: and comments (template / f1000). All generated $Lx references must eventually get a x: line. Otherwise the UI won't BE VISIBLE. THIS IS CRITICAL. IF THIS FAILS, NOTHING ELSE WORKS.
- Most lines should have a $L reference. This is especially true for the first few UI lines. Line 0: should always reference other lines.
- Do not stop until all line references are resolved.

Generate the tree from the top first. Header, footer, main, inside header, inside footer, inside main, and so on. Start at the top and work your way deeper.
Do not generate UI elements too far away from each other.
Be careful about using correct line references.
Generate a high volume of content in the main area. It should look like a real website.

        `,
        },
        // {
        //   role: "system",
        //   content: `
        //   This is what the user asked for previously:

        //   Previous resulting RSC payload:
        //   ${previousRscPayload}"

        //   You can use this as a guide when generating the new RSC payload, but make sure that the new payload is still valid.
        //   Making use of line references to split the payload into multiple lines may help when improving a generation.`,
        // },
        {
          role: "system",
          content: `
# Images
When generating responses, you may want to include image.
You can use https://source.unsplash.com/random/200x200?sig=1 and use a random number for the sig parameter.
ONLY use images when the user specifically asks for it. Do not use them otherwise.

There are also company logos available. You can use them like this:
https://logo.clearbit.com/:domain

Make sure that images are not too large.
            `,
        },
        {
          role: "system",
          content: `
# Styling
Always make the result as pretty and realistic as possible by styling with Tailwind classNames.
Strive for a minimal and muted design.
Everything should look beautiful and real, like a well-designed website.

Do not simplify or leave content unfinished like placeholders. Everything should look real.
BANNED STYLES:
- The style prop
- The Tailwind fixed className (position: fixed;)
- all svgs. Do no generate them.

Keep in mind that the output screen size is a very small laptop. DO not use classNames like min-h-screen.
If the user is unclear, do expand into something that would appear on the the web.
          `,
        },
        //         {
        //           role: "system",
        //           content: `
        // # The response could should be structured similar the following example:
        // f0: (Use the # Plan program)
        // f2: (Use the # Plan program)
        // 0: (actual UI the root element, linking to the other lines)
        // f2: (Use the # Plan program)
        // 1: (actual UI, short)
        // f3: (Use the # Plan program)
        // f4: (Use the # Plan program)
        // 2: (actual UI, short)
        // f5: (Use the # Plan program)
        // 3: (actual UI, short)
        // 4: (actual UI, short)
        // 5: (actual UI, short)
        // f6: (Use the # Plan program)
        // 6: (actual UI, short)
        // 7: (actual UI, short)
        // (as many as needed)

        // It's important that you always reply in the RSC payload format. The payload always has to be complete and have the same number of opening and closing brackets. Respond without extra newlines or # comments.
        //           `,
        //         },
        // {
        //   role: "system",
        //   content: `.
        //   Example of a payload (do not return the tripple double quotes):
        //   0:["$","h2",null,{"children":"Test"}]\n

        //   DO NOT wrap the response in \`\`\` or . NO BACKTICKS. Make sure that the response ALWAYS starts with 0: and ALWAYS ENDS with a newline like \n. The newline at the end is especially important for the parsing to work.`,
        // },
        {
          role: "system",
          content: `.
          Example of a payload (do not return the tripple double quotes):
          0:["$","h2",null,{"children":"Test"}]\n

          DO NOT wrap the response in \`\`\` or . NO BACKTICKS. Make sure that the response ALWAYS starts with 0: and ALWAYS ENDS with a newline like \n. The newline at the end is especially important for the parsing to work.`,
        },
        {
          role: "user",
          content: `
User prompt:
${prompt}.
          `,
        },
      ],
    });

    for await (const delta of textStream) {
      //await new Promise((resolve) => setTimeout(resolve, 50));
      stream.update(delta);
    }

    stream.done();
  })();

  return { output: stream.value };
}
