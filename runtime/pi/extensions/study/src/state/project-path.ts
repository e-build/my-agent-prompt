import { resolve, sep } from "node:path";

export function projectPath(projectRoot: string, ...paths: string[]): string {
  const root = resolve(projectRoot);
  const absolute = resolve(root, ...paths);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`프로젝트 밖 경로는 사용할 수 없습니다: ${paths.join("/")}`);
  }
  return absolute;
}
