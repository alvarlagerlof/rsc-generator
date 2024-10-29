"use client";

import {
  ReactNode,
  use,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { generateRsc } from "./generateRsc";
import { readStreamableValue } from "ai/rsc";
import { ErrorBoundary } from "react-error-boundary";
// import { unstable_Viewer, unstable_createFlightResponse } from "@rsc-parser/core";
// @ts-expect-error TODO: Fix later
import { BeatLoading } from "respinner";
import { unstable_Viewer as Viewer } from "@rsc-parser/core";

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
                  className={`rounded-lg bg-white dark:bg-slate-900 h-28 block p-3 ${
                    version.id === currentVersionId
                      ? "outline outline-2 outline-black"
                      : ""
                  }`}
                >
                  {version.isPending ? (
                    <div className="flex flex-col justify-between size-full items-center">
                      <div className="w-full h-1/6 flex flex-row justify-between">
                        <div className="bg-gray-100 dark:bg-slate-800 animate-pulse rounded-md w-1/5 h-full" />
                        <div className="bg-gray-100 dark:bg-slate-800 animate-pulse rounded-md w-1/3 h-full" />
                      </div>
                      <div className="bg-gray-100 dark:bg-slate-800 animate-pulse rounded-md w-2/3 h-1/2" />
                      <div className="bg-gray-100 dark:bg-slate-800 animate-pulse rounded-md w-full h-1/6" />
                    </div>
                  ) : (
                    <ShrinkPreview>
                      <ErrorBoundary
                        fallback={<p>Error</p>}
                        key={currentVersion?.rscPayload ?? ""}
                      >
                        {/* <RenderRscPayload rscPayload={version.rscPayload} /> */}
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
              <div className="overflow-y-auto max-h-[500px] min-h-96 bg-white dark:text-black dark:bg-slate-900 rounded-lg p-4">
                <ErrorBoundary
                  fallback={<p>Error</p>}
                  key={currentVersion?.rscPayload ?? ""}
                >
                  <RenderRscPayload
                    rscPayload={currentVersion?.rscPayload ?? ""}
                  />
                </ErrorBoundary>
              </div>

              {typeof currentVersion?.rscPayload === "string" &&
              currentVersion?.rscPayload !== "" ? (
                <>
                  <Box title="RSC Payload (raw):">
                    <RawRscPayload
                      rscPayload={currentVersion?.rscPayload ?? ""}
                    />
                  </Box>
                </>
              ) : null}
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

              if (openAIApiKeyValue === null) {
                // Handle the case where the prompt was canceled
                console.log("User canceled the prompt");
                // Add logic to safely exit or provide user feedback
                return;
              }

              if (
                openAIApiKeyValue.trim() === "" &&
                process.env.NODE_ENV !== "development"
              ) {
                alert("Please enter a valid OpenAI API key");
                return;
              }

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
                    currentGeneration = `${currentGeneration}${delta}`
                      .replaceAll("```", "")
                      .replaceAll("json", "");
                    // console.log(`current generation: ${currentGeneration}`);

                    if (newVersionId !== currentVersionId) {
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
            <div className="bg-white dark:bg-slate-900 w-full rounded-lg flex flex-row p-1.5 gap-1.5 items-center">
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
                  isPending
                    ? "text-gray-200 bg-gray-500 dark:bg-slate-800"
                    : "bg-black dark:bg-slate-800"
                }`}
                disabled={isPending}
              >
                {isPending ? (
                  <div className="p-2">
                    <BeatLoading count={3} fill="white" />
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
                "Weather in London",
                // "CRM data with 10 customers containing contact info on various platforms and orders. Each order should have items. Each item should have a category, that may be used on multiple items.",
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
      className={`rounded-full bg-white dark:bg-slate-900 py-1.5 px-3 ${
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
      <div className="dark:hidden">
        <BeatLoading count={3} />
      </div>
      <div className="hidden dark:block">
        <BeatLoading count={3} fill="white" />
      </div>
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
        className={`bg-white dark:bg-slate-900 rounded-lg p-4 min-h-64 ${
          isPending ? "bg-opacity-60" : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}

function RenderRscPayload({ rscPayload }: { rscPayload: string | null }) {
  if (rscPayload === null) {
    return <PreparingEmptyState />;
  }

  // Parse the JSON data
  let variables;
  try {
    variables = JSON.parse(
      closeJsonBrackets(removeEverythingAfterLastComma(rscPayload))
    );
  } catch (e) {
    console.error("Failed to parse JSON data:", e);
    return;
  }

  // Function to recursively resolve references
  // @ts-expect-error Types
  function resolveReferences(
    obj: any,
    // @ts-expect-error Types
    variables,
    resolved = new Map(),
    resolving = new Set()
  ) {
    if (Array.isArray(obj)) {
      return obj.map((item) =>
        resolveReferences(item, variables, resolved, resolving)
      );
    } else if (typeof obj === "object" && obj !== null) {
      const result = {};
      for (const key in obj) {
        // @ts-expect-error Types
        result[key] = resolveReferences(
          obj[key],
          variables,
          resolved,
          resolving
        );
      }
      return result;
    } else if (typeof obj === "string" && obj.startsWith("$")) {
      const varName = obj;

      if (resolved.has(varName)) {
        // Return the cached result if already resolved
        return resolved.get(varName);
      }

      if (resolving.has(varName)) {
        // Circular reference detected
        //throw new Error(`Circular reference detected for variable ${varName}`);
        return obj;
      }

      if (variables.hasOwnProperty(varName)) {
        resolving.add(varName); // Mark the variable as being resolved
        // @ts-expect-error Types
        const value = resolveReferences(
          variables[varName],
          variables,
          resolved,
          resolving
        );
        resolving.delete(varName); // Remove the variable from the resolving set
        resolved.set(varName, value); // Cache the resolved value
        return value;
      } else {
        // Variable not found in variables object
        return obj;
      }
    } else {
      return obj;
    }
  }

  return (
    <pre className="w-full min-w-full text-sm dark:text-white">
      {JSON.stringify(
        resolveReferences(variables["$result"], variables),
        null,
        2
      )}
    </pre>
  );
}

function removeEverythingAfterLastComma(jsonString: string) {
  const lastCommaIndex = jsonString.lastIndexOf(",");
  if (lastCommaIndex === -1) {
    return jsonString;
  }
  return jsonString.substring(0, lastCommaIndex);
}

function closeJsonBrackets(jsonString: string) {
  let current = [];

  for (const letter of jsonString) {
    switch (letter) {
      case "{":
        current.push("}");
        break;
      case "[":
        current.push("]");
        break;
      case "}":
        current.pop();
        break;
      case "]":
        current.pop();
        break;
    }
  }

  // repeat opposite of current
  const closingBrackets = current.reverse().join("");

  return jsonString + closingBrackets;
}
