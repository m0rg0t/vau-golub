import { pathToFileURL } from "node:url";

// Node 20 не поддерживает import.meta.main (появился в Node 22): guard тихо
// становится falsy и main() не выполняется. Фолбэк сравнивает URL модуля с
// запущенным entrypoint-файлом.
export function isMainModule(meta: ImportMeta): boolean {
  if (typeof meta.main === "boolean") {
    return meta.main;
  }
  const entry = process.argv[1];
  return entry !== undefined && meta.url === pathToFileURL(entry).href;
}
