"use client";

import { ReactNode, Suspense, use, useState, useTransition } from "react";
import { createFromReadableStream } from "react-server-dom-webpack/client";
import { generateRsc } from "./generateRsc";
import { readStreamableValue } from "ai/rsc";
import { ErrorBoundary } from "react-error-boundary";
// import { unstable_Viewer, unstable_createFlightResponse } from "@rsc-parser/core";

async function createRscStream(rscPayload: string) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(rscPayload));
    },
  });

  return createFromReadableStream(stream);
}

export default function TestPage() {
  const [rscPayload, setRscPayload] = useState<string | null>(null);
  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null);
  const [previousRscPayload, setPreviousRscPayload] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col h-full grow gap-8">
      <div className="flex gap-8 flex-col grow">
        <RenderedRscPayloadBox
          rscPayload={
            //isPending
            false
              ? previousRscPayload
              : getValidRscPayloadFromPartial(rscPayload)
          }
          isPending={isPending}
        />

        <RawRscPayloadBox rscPayload={rscPayload} />
      </div>

      <form
        action={async (formData) => {
          const prompt = formData.get("prompt");
          if (typeof prompt !== "string") {
            throw new Error("Prompt must be a string");
          }

          setPreviousPrompt(prompt);

          startTransition(async () => {
            try {
              const { output } = await generateRsc(prompt, {
                previousPrompt,
                previousRscPayload,
              });

              let currentGeneration = "";
              for await (const delta of readStreamableValue(output)) {
                currentGeneration = `${currentGeneration}${delta}`.replaceAll(
                  "```",
                  "",
                );
                console.log(`current generation: ${currentGeneration}`);
                setRscPayload(currentGeneration);
              }
              setPreviousRscPayload(currentGeneration);
            } catch (error) {
              console.error("general error", error);
            }
          });
        }}
      >
        <div className="bg-white w-full rounded-lg flex flex-row p-1.5 gap-1.5 items-center">
          <input
            name="prompt"
            placeholder="What do you want?"
            className={`w-full p-2 bg-gray-100 bg-transparent ${isPending ? "text-gray-500" : ""}`}
            disabled={isPending}
          />

          <button
            type="submit"
            className={`text-white h-full rounded-md p-2 ${isPending ? "text-gray-200 bg-gray-500" : "bg-black"}`}
            disabled={isPending}
          >
            Generate
          </button>
        </div>
      </form>
    </div>
  );
}

function RawRscPayloadBox({ rscPayload }: { rscPayload: string | null }) {
  if (!rscPayload) {
    return <Box title="RSC Payload:">No RSC Payload yet</Box>;
  }

  return (
    <Box title="RSC Payload:">
      <pre className="break-all whitespace-pre-wrap text-xs leading-5">
        {rscPayload}
      </pre>
    </Box>
  );
}

function RenderedRscPayloadBox({
  rscPayload,
  isPending,
}: {
  rscPayload: string | null;
  isPending: boolean;
}) {
  if (!rscPayload) {
    return <Box title="Rendered:">No RSC Payload yet.</Box>;
  }

  if (!isValidRscPayload(rscPayload)) {
    return <Box title="Rendered:">Not a valid RSC Payload</Box>;
  }

  return (
    <Box title="Rendered:" isPending={isPending}>
      <ErrorBoundary fallback={<p>Error</p>} key={rscPayload}>
        <Suspense fallback={<p>Loading...</p>} key={rscPayload}>
          <RenderRscPayload rscPayload={rscPayload} />
        </Suspense>
      </ErrorBoundary>
    </Box>
  );
}

function Box({
  title,
  isPending = false,
  children,
}: {
  title: string;
  isPending?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="font-medium">{title}</h2>
      <div
        className={`bg-white rounded-lg p-4 ${isPending ? "bg-opacity-60" : ""}`}
      >
        {children}
      </div>
    </section>
  );
}

function getValidRscPayloadFromPartial(partialRscPayload: string | null) {
  if (partialRscPayload === null) {
    return partialRscPayload;
  }

  const splitByNewLines = partialRscPayload.split("\n");

  if (splitByNewLines.length === 0 || splitByNewLines.length === 1) {
    return partialRscPayload;
  }

  // Return every array item except the last one and join
  splitByNewLines.pop();
  return splitByNewLines.join("\n") + "\n";
}

function isValidRscPayload(rscText: string) {
  if (!rscText.startsWith("0:")) {
    return false;
  }

  if (!rscText.endsWith("\n")) {
    return false;
  }

  return true;
}

function insertSuspenseBoundaries(rscPayload: string) {
  // Find unresolved line refenreces
  const lineReferences = [...rscPayload.matchAll(/\$L\d{1,2}/g)].map((a) =>
    a["0"].replace("$L", ""),
  );
  const lines = rscPayload
    .split("\n")
    .map((line) => line.split(":").at(0))
    .filter((line) => line !== "");

  const unresolvedLineRefereces = [];
  for (const lineReference of lineReferences) {
    // Try to find the line reference among the lines
    if (!lines.includes(lineReference)) {
      unresolvedLineRefereces.push(lineReference);
    }
  }

  console.log("unresolvedLineRefereces", unresolvedLineRefereces);

  function createSuspenseBoundary(lineReference: string) {
    const boundary = `["$","$a",null,{"fallback":["$","p",null,{"children":"Generating..."}],"children":"$L${lineReference}"}]`;

    return boundary;
  }

  const suspenseSymbolLine = `a:"$Sreact.suspense"`;

  let clonedPayload = `${rscPayload}`;
  // Find unresolved references and add suspense boundaries
  for (const unresolvedLineReference of unresolvedLineRefereces) {
    console.log("regex", String.raw`\$L${unresolvedLineReference}`);
    clonedPayload = clonedPayload.replace(
      new RegExp(String.raw`"\$L${unresolvedLineReference}"`, "g"),
      createSuspenseBoundary(unresolvedLineReference),
    );
  }

  console.log("result", `${suspenseSymbolLine}\n${clonedPayload}`);

  return `${suspenseSymbolLine}\n${clonedPayload}`;
}

const promiseCache = new Map<string, Promise<any>>();

function RenderRscPayload({ rscPayload }: { rscPayload: string | null }) {
  if (rscPayload === null) {
    return "No RSC Payload yet.";
  }

  if (!isValidRscPayload(rscPayload)) {
    return "Invalid RSC Payload.";
  }

  const rscPayloadWithSuspenseBoundaries = insertSuspenseBoundaries(rscPayload);

  const promiseCacheValue = promiseCache.get(rscPayloadWithSuspenseBoundaries);

  if (promiseCacheValue === undefined) {
    promiseCache.set(
      rscPayloadWithSuspenseBoundaries,
      createRscStream(rscPayloadWithSuspenseBoundaries),
    );
  }

  if (promiseCacheValue === undefined) {
    return "no promiseCacheValue";
  }

  return (
    <div className=" overflow-y-auto w-full min-w-full">
      {use(promiseCacheValue)}
    </div>
  );
}
