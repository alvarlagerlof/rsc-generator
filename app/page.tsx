"use client";

import {
  ReactNode,
  Suspense,
  use,
  useRef,
  useState,
  useTransition,
} from "react";
// @ts-expect-error TODO: Fix later
import { createFromReadableStream } from "react-server-dom-webpack/client";
import { generateRsc } from "./generateRsc";
import { readStreamableValue } from "ai/rsc";
import { ErrorBoundary } from "react-error-boundary";
// import { unstable_Viewer, unstable_createFlightResponse } from "@rsc-parser/core";

export default function TestPage() {
  const [versions, setVersions] = useState<
    { id: string; prompt: string; isPending: boolean; rscPayload: string }[]
  >([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const currentVersion = versions.find(
    (version) => version.id === currentVersionId,
  );
  const [isPending, startTransition] = useTransition();

  const state: "inital" | "edits" =
    versions.length > 0 && versions[0].rscPayload != "" ? "edits" : "inital";

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSuggestionClick = (suggestion: string) => {
    if (!inputRef.current || !formRef.current) {
      return;
    }
    inputRef.current.setAttribute("value", suggestion);
    formRef.current.requestSubmit();
  };

  return (
    <div className="flex flex-col md:flex-row h-full grow gap-8">
      {state === "edits" ? (
        <aside className="flex flex-col gap-4 shrink w-48 min-w-48">
          {versions.map((version) => {
            return (
              <div
                key={version.id}
                className="flex flex-col gap-1.5"
                onClick={() => {
                  setCurrentVersionId(version.id);
                }}
              >
                <div
                  className={`rounded-lg bg-white h-28 block p-3 ${
                    version.id === currentVersionId
                      ? "outline outline-2 outline-black"
                      : ""
                  }`}
                >
                  {version.isPending ? (
                    <div className="flex flex-col justify-between size-full items-center">
                      <div className="w-full h-1/6 flex flex-row justify-between">
                        <div className="bg-gray-100 animate-pulse rounded-md w-1/5 h-full" />
                        <div className="bg-gray-100 animate-pulse rounded-md w-1/3 h-full" />
                      </div>
                      <div className="bg-gray-100 animate-pulse rounded-md w-2/3 h-1/2" />
                      <div className="bg-gray-100 animate-pulse rounded-md w-full h-1/6" />
                    </div>
                  ) : (
                    <ShrinkPreview>
                      <RenderedRscPayload rscPayload={version.rscPayload} />
                    </ShrinkPreview>
                  )}
                </div>
                <p className="break-all whitespace-pre-wrap text-center text-sm w-full">
                  {version.prompt}
                </p>
              </div>
            );
          })}
        </aside>
      ) : null}

      <main className="flex flex-col w-full gap-8">
        {state === "edits" ? (
          <>
            <div className="flex gap-8 flex-col grow">
              <div className="overflow-y-auto max-h-[500px] bg-white rounded-lg p-4">
                <RenderedRscPayload
                  rscPayload={getValidRscPayloadFromPartial(
                    currentVersion?.rscPayload ?? "",
                  )}
                />
              </div>

              <Box title="RSC Payload:">
                <RawRscPayload rscPayload={currentVersion?.rscPayload ?? ""} />
              </Box>
            </div>
          </>
        ) : null}

        <div
          className={`sticky flex flex-col gap-3 items-center ${
            state === "edits" ? "bottom-8" : "top-32"
          }`}
        >
          <form
            className="sticky shadow-lg w-full"
            ref={formRef}
            action={async (formData) => {
              const prompt = formData.get("prompt");
              if (typeof prompt !== "string") {
                throw new Error("Prompt must be a string");
              }

              startTransition(async () => {
                try {
                  const previousVersion = versions.at(-1);
                  const previousPrompt = previousVersion?.prompt ?? null;
                  const previousRscPayload =
                    previousVersion?.rscPayload ?? null;

                  const { output } = await generateRsc(prompt, {
                    previousPrompt,
                    previousRscPayload,
                  });

                  const newVersionId = prompt + Date.now();

                  let currentGeneration = "";
                  for await (const delta of readStreamableValue(output)) {
                    currentGeneration =
                      `${currentGeneration}${delta}`.replaceAll("```", "");
                    console.log(`current generation: ${currentGeneration}`);

                    if (
                      isValidRscPayload(
                        // @ts-expect-error What?
                        getValidRscPayloadFromPartial(currentGeneration),
                      )
                    ) {
                      setCurrentVersionId(newVersionId);
                    }

                    setVersions((previousVersions) => {
                      // check if the version has added
                      if (
                        previousVersions.find(
                          (previousVersion) =>
                            previousVersion.id === newVersionId,
                        )
                      ) {
                        return previousVersions.map((previousVersion) => {
                          if (previousVersion.id === newVersionId) {
                            return {
                              id: newVersionId,
                              prompt,
                              isPending: true,
                              rscPayload: currentGeneration,
                            };
                          }

                          return previousVersion;
                        });
                      }

                      // otherwise add a new version
                      return [
                        ...previousVersions,
                        {
                          id: newVersionId,
                          prompt,
                          isPending: true,
                          rscPayload: currentGeneration,
                        },
                      ];
                    });
                  }

                  setVersions((previousVersions) => {
                    return previousVersions.map((previousVersion) => {
                      if (previousVersion.id === newVersionId) {
                        return {
                          ...previousVersion,
                          isPending: false,
                        };
                      }

                      return previousVersion;
                    });
                  });
                } catch (error) {
                  console.error("general error", error);
                }

                if (inputRef.current) {
                  inputRef.current.setAttribute("value", "");
                }
              });
            }}
          >
            <div className="bg-white w-full rounded-lg flex flex-row p-1.5 gap-1.5 items-center">
              <input
                name="prompt"
                ref={inputRef}
                placeholder="What do you want to generate?"
                className={`w-full p-2 bg-gray-100 bg-transparent ${
                  isPending ? "text-gray-500" : ""
                }`}
                disabled={isPending}
              />

              <button
                type="submit"
                className={`text-white h-full rounded-md p-2 ${
                  isPending ? "text-gray-200 bg-gray-500" : "bg-black"
                }`}
                disabled={isPending}
              >
                Generate
              </button>
            </div>
          </form>

          {state === "inital" ? (
            <div className="flex flex-row gap-2 flex-wrap justify-center">
              {[
                "Google.com home page",
                "Netflix.com home page",
                "Twitter svg blue",
                "Youtube.com start page",
                "Google maps with a search field overlay",
                "Personal website blog post about reacr server components",
              ].map((suggestion) => {
                return (
                  <SuggestionButton
                    key={suggestion}
                    onSuggestionClick={onSuggestionClick}
                    isPending={isPending}
                  >
                    {suggestion}
                  </SuggestionButton>
                );
              })}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function SuggestionButton({
  children,
  onSuggestionClick,
  isPending,
}: {
  children: string;
  onSuggestionClick: (suggestion: string) => void;
  isPending: boolean;
}) {
  return (
    <button
      className={`rounded-full bg-white py-1.5 px-3 ${
        isPending ? "text-gray-500" : ""
      }`}
      disabled={isPending}
      onClick={() => {
        onSuggestionClick(children);
      }}
    >
      {children}
    </button>
  );
}

function ShrinkPreview({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md overflow-clip pointer-events-none">
      <div className="scale-[0.23] origin-top-left overflow-y-clip">
        <div className="h-96 w-[765px] overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function RawRscPayload({ rscPayload }: { rscPayload: string | null }) {
  if (!rscPayload) {
    return "No RSC Payload yet";
  }

  return (
    <pre className="break-all whitespace-pre-wrap text-xs leading-5">
      {rscPayload}
    </pre>
  );
}

function RenderedRscPayload({ rscPayload }: { rscPayload: string | null }) {
  if (!rscPayload) {
    return "No RSC Payload yet.";
  }

  if (!isValidRscPayload(rscPayload)) {
    return "Not a valid RSC Payload";
  }

  return (
    <ErrorBoundary fallback={<p>Error</p>} key={rscPayload}>
      {/* TODO: This suspense boundary cause the UI to jump a lot. *}
      {/* <Suspense fallback={<p>Loading...</p>} key={rscPayload}> */}
      <RenderRscPayload rscPayload={rscPayload} />
      {/* </Suspense> */}
    </ErrorBoundary>
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
        className={`bg-white rounded-lg p-4 ${
          isPending ? "bg-opacity-60" : ""
        }`}
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

  function createSuspenseBoundary(lineReference: string) {
    const boundary = `["$","$a",null,{"fallback":["$","p",null,{"children":"Generating..."}],"children":"$L${lineReference}"}]`;

    return boundary;
  }

  const suspenseSymbolLine = `a:"$Sreact.suspense"`;

  let clonedPayload = `${rscPayload}`;
  // Find unresolved references and add suspense boundaries
  for (const unresolvedLineReference of unresolvedLineRefereces) {
    clonedPayload = clonedPayload.replace(
      new RegExp(String.raw`"\$L${unresolvedLineReference}"`, "g"),
      createSuspenseBoundary(unresolvedLineReference),
    );
  }

  return `${suspenseSymbolLine}\n${clonedPayload}`;
}

async function createRscStream(rscPayload: string) {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(rscPayload));
    },
  });

  return createFromReadableStream(stream);
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

  return <div className="w-full min-w-full">{use(promiseCacheValue)}</div>;
}
