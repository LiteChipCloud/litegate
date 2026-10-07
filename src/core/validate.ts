import TOML from "@iarna/toml";
import yaml from "js-yaml";

export function assertValidJSON(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${label} 生成的 JSON 校验失败：${(e as Error).message}`);
  }
}

export function assertValidTOML(text: string, label: string): unknown {
  try {
    return TOML.parse(text);
  } catch (e) {
    throw new Error(`${label} 生成的 TOML 校验失败：${(e as Error).message}`);
  }
}

export function assertValidYAML(text: string, label: string): unknown {
  try {
    return yaml.load(text);
  } catch (e) {
    throw new Error(`${label} 生成的 YAML 校验失败：${(e as Error).message}`);
  }
}
