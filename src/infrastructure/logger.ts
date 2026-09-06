type LogFields = Record<string, unknown>;

function write(level: "info" | "error", message: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...fields
  });

  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(message: string, fields: LogFields = {}): void {
    write("info", message, fields);
  },
  error(message: string, fields: LogFields = {}): void {
    write("error", message, fields);
  }
};
