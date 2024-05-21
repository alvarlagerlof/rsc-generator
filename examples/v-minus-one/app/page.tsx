"use client";

import {
  ReactNode,
  use,
  useOptimistic,
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
// @ts-expect-error TODO: Fix later
import { BeatLoading } from "respinner";

export const maxDuration = 240;

type Version = {
  id: string;
  prompt: string;
  isPending: boolean;
  rscPayload: string;
};

export default function Page() {
  const [versions, setVersions] = useState<
    { id: string; prompt: string; isPending: boolean; rscPayload: string }[]
  >([]);

  const [optimisticVersions, addOptimisticVersion] = useOptimistic(
    versions,
    (state, newVersion: Version) => [
      ...state,
      {
        ...newVersion,
      },
    ]
  );

  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const currentVersion = optimisticVersions.find(
    (version) => version.id === currentVersionId
  );
  const [isPending, startTransition] = useTransition();

  const state: "initial" | "edit" =
    versions.length > 0 || isPending ? "edit" : "initial";

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSuggestionClick = (suggestion: string) => {
    if (!inputRef.current || !formRef.current) {
      return;
    }
    inputRef.current.setAttribute("value", suggestion);
    formRef.current.requestSubmit();
  };

  const [openAIApiKey, setOpenAIApiKey] = useState<string | null>(null);

  return (
    <div className="flex flex-col md:flex-row h-full grow gap-8">
      {state === "edit" ? (
        <aside className="flex flex-col gap-4 shrink w-48 min-w-48">
          {[
            ...new Map(
              optimisticVersions.map((item) => [item.id, item])
            ).values(),
          ].map((version) => {
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
                      <ErrorBoundary
                        fallback={<p>Error</p>}
                        key={currentVersion?.rscPayload ?? ""}
                      >
                        <RenderRscPayload rscPayload={version.rscPayload} />
                      </ErrorBoundary>
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
        {state === "edit" ? (
          <>
            <div className="flex gap-8 flex-col grow">
              <div className="overflow-y-auto max-h-[500px] min-h-96 bg-white rounded-lg p-4">
                <ErrorBoundary
                  fallback={<p>Error</p>}
                  key={currentVersion?.rscPayload ?? ""}
                >
                  <RenderRscPayload
                    rscPayload={getValidRscPayloadFromPartial(
                      currentVersion?.rscPayload ?? ""
                    )}
                  />
                </ErrorBoundary>
              </div>

              <Box title="RSC Payload:">
                <RawRscPayload rscPayload={currentVersion?.rscPayload ?? ""} />
              </Box>
            </div>
          </>
        ) : null}

        <div
          className={`sticky flex flex-col gap-3 items-center ${
            state === "edit" ? "bottom-8" : "top-32"
          }`}
        >
          <form
            className="sticky shadow-lg w-full"
            ref={formRef}
            action={async (formData) => {
              const prompt = formData.get("prompt");
              const openAIApiKeyValue =
                openAIApiKey === null
                  ? window.prompt("OpenAI API key (unsafe but cool)", "")
                  : openAIApiKey;
              if (
                typeof prompt !== "string" ||
                typeof openAIApiKeyValue !== "string"
              ) {
                throw new Error("Prompt must be a string");
              }

              setOpenAIApiKey(openAIApiKeyValue);

              const newVersionId = prompt + Date.now();

              addOptimisticVersion({
                id: newVersionId,
                prompt,
                isPending: true,
                rscPayload: currentVersion?.rscPayload ?? "",
              });

              setCurrentVersionId(newVersionId);

              startTransition(async () => {
                try {
                  const previousVersion = versions.at(-1);
                  const previousPrompt = previousVersion?.prompt ?? null;
                  const previousRscPayload =
                    previousVersion?.rscPayload ?? null;

                  const { output } = await generateRsc(prompt, {
                    openAIApiKey: openAIApiKeyValue,
                    previousPrompt,
                    previousRscPayload,
                  });

                  let currentGeneration = "";
                  for await (const delta of readStreamableValue(output)) {
                    currentGeneration =
                      `${currentGeneration}${delta}`.replaceAll("```", "");
                    console.log(`current generation: ${currentGeneration}`);

                    if (
                      isValidRscPayload(
                        // @ts-expect-error What?
                        getValidRscPayloadFromPartial(currentGeneration)
                      ) &&
                      newVersionId !== currentVersionId
                    ) {
                      setCurrentVersionId(newVersionId);
                    }

                    setVersions((previousVersions) => {
                      // check if the version has added
                      if (
                        previousVersions.find(
                          (previousVersion) =>
                            previousVersion.id === newVersionId
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
              <div className="flex flex-col gap-1.5 grow">
                <input
                  name="prompt"
                  ref={inputRef}
                  placeholder="What do you want to generate?"
                  className={`w-full p-2 bg-gray-100 bg-transparent ${
                    isPending ? "text-gray-500" : ""
                  }`}
                  disabled={isPending}
                />

                {/* <input
                  name="openAIApiKey"
                  defaultValue={openAIApiKey ?? ""}
                  onChange={(event) => {
                    setOpenAIApiKey(event.target.value);
                  }}
                  placeholder="OpenAI API key (unsafe but cool)"
                  className={`w-full p-2 bg-gray-100 bg-transparent ${
                    isPending ? "text-gray-500" : ""
                  }`}
                  disabled={isPending}
                /> */}
              </div>

              <button
                type="submit"
                className={`text-white h-full rounded-md p-2 ${
                  isPending ? "text-gray-200 bg-gray-500" : "bg-black"
                }`}
                disabled={isPending}
              >
                {isPending ? (
                  <div className="p-2">
                    <BeatLoading count={3} />
                  </div>
                ) : (
                  "Generate"
                )}
              </button>
            </div>
          </form>

          {state === "initial" ? (
            <div className="flex flex-row gap-2 flex-wrap justify-center">
              {[
                "Google.com home page",
                "Netflix.com home page (logged in)",
                "Twitter svg blue",
                "Twitter.com home page (logged in)",
                "Youtube.com start page",
                "Google maps with a search field overlay",
                "Personal website blog post about react server components",
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

function PreparingEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <BeatLoading count={3} />
    </div>
  );
}

function RawRscPayload({ rscPayload }: { rscPayload: string | null }) {
  if (!rscPayload) {
    return <PreparingEmptyState />;
  }

  return (
    <pre className="break-all whitespace-pre-wrap text-xs leading-5">
      {rscPayload}
    </pre>
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
        className={`bg-white rounded-lg p-4 min-h-64 ${
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
    a["0"].replace("$L", "")
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
      createSuspenseBoundary(unresolvedLineReference)
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
    return <PreparingEmptyState />;
  }

  if (!isValidRscPayload(rscPayload)) {
    return <PreparingEmptyState />;
  }

  const rscPayloadWithSuspenseBoundaries = insertSuspenseBoundaries(rscPayload);

  const promiseCacheValue = promiseCache.get(rscPayloadWithSuspenseBoundaries);

  if (promiseCacheValue === undefined) {
    promiseCache.set(
      rscPayloadWithSuspenseBoundaries,
      createRscStream(rscPayloadWithSuspenseBoundaries)
    );
  }

  if (promiseCacheValue === undefined) {
    return "no promiseCacheValue";
  }

  return <div className="w-full min-w-full">{use(promiseCacheValue)}</div>;
}
