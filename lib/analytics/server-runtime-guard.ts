if (typeof window !== "undefined") {
  throw new Error("The analytics server entry cannot run in a browser.");
}

export const analyticsServerRuntime = "server" as const;
