"use client";

import {
  ReactNode,
  Suspense,
  use,
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createFromReadableStream } from "react-server-dom-webpack/client";
import { generateRsc } from "./generateRsc";
import { readStreamableValue } from "ai/rsc";
import { ErrorBoundary } from "react-error-boundary";
import { flushSync } from "react-dom";

function createRscPayload(rscTree: string) {
  return `0:${rscTree}\n`;
}

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
        <RawRscPayloadBox rscPayload={rscPayload} />

        <RenderedRscPayloadBox
          rscPayload={isPending ? previousRscPayload : rscPayload}
          isPending={isPending}
        />
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
                currentGeneration = `${currentGeneration}${delta}`;
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

function RenderedRscPayloadBox({ rscPayload }: { rscPayload: string | null }) {
  if (!rscPayload) {
    return <Box title="Rendered:">No RSC Payload yet.</Box>;
  }

  if (!isValidRscPayload(rscPayload)) {
    return <Box title="Rendered:">Not a valid RSC Payload</Box>;
  }

  return (
    <Box title="Rendered:">
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

function isValidRscPayload(rscText: string) {
  if (!rscText.startsWith("0:")) {
    return false;
  }

  if (!rscText.endsWith("\n")) {
    return false;
  }

  return true;
}

const promiseCache = new Map<string, Promise<any>>();

function RenderRscPayload({ rscPayload }: { rscPayload: string | null }) {
  if (rscPayload === null) {
    return "No RSC Payload yet.";
  }

  if (!isValidRscPayload(rscPayload)) {
    return "Invalid RSC Payload.";
  }

  const promiseCacheValue = promiseCache.get(rscPayload);

  if (promiseCacheValue === undefined) {
    promiseCache.set(rscPayload, createRscStream(rscPayload));
  }

  if (promiseCacheValue === undefined) {
    return "no promiseCacheValue";
  }

  return <>{use(promiseCacheValue)}</>;
}
