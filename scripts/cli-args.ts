export function getScriptArgs() {
  return process.argv.slice(2).filter((arg) => arg !== "--");
}
