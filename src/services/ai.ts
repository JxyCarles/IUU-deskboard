import SPEC from "../../docs/扩展规范.md?raw";
import { call } from "../api";
import { getState } from "../store";
import type { AISettings } from "../types";
import { today } from "../utils";

export { SPEC };

export const AI_PROVIDERS: Record<AISettings["provider"], { name: string; defaultModel: string; keyFrom: string }> = {
  deepseek: { name: "DeepSeek", defaultModel: "deepseek-chat", keyFrom: "使用「AI 额度」页面里保存的 DeepSeek Key" },
  glm: { name: "智谱 GLM", defaultModel: "glm-4-flash", keyFrom: "使用「AI 额度」页面里保存的智谱 Key" },
  claude: { name: "Claude", defaultModel: "claude-opus-5", keyFrom: "需要单独填写 Anthropic API Key（不是 Admin Key）" },
  custom: { name: "自定义（OpenAI 兼容）", defaultModel: "", keyFrom: "填写接口地址、模型名和 Key，适用于 OpenAI、硅基流动、Kimi、本地 Ollama 等" },
};

/** 取出规范里的某一章（按“## 一、”“## 二、”这样的二级标题切分） */
export function specSection(n: "一" | "二" | "三") {
  const parts = SPEC.split(/\n(?=## )/);
  const head = parts[0];
  const sec = parts.find((p) => p.startsWith(`## ${n}、`)) ?? "";
  return `${head}\n\n${sec}`;
}

/** 从模型输出里取出 JSON：兼容 ```json 代码块、前后多余文字 */
export function parseJsonLoose(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

export async function aiText(system: string, user: string, json = true): Promise<string> {
  const s = getState().settings.ai;
  return call<string>("ai_chat", { provider: s.provider, model: s.model || null, baseUrl: s.baseUrl || null, system, user, json });
}

export async function aiJson(system: string, user: string): Promise<unknown> {
  const text = await aiText(system, user, true);
  try {
    return parseJsonLoose(text);
  } catch {
    throw new Error("AI 返回的不是有效 JSON：" + text.slice(0, 200));
  }
}

/** 把任意原始材料整理成 deskboard.import/v1 */
export function aiOrganize(raw: string) {
  const system = `${specSection("一")}

你是「桌面看板」的数据整理助手。按上面的 deskboard.import/v1 规范，把用户给的材料整理成一个 JSON 对象。
今天是 ${today()}。只输出 JSON，不要任何解释。材料里没有的信息不要编造；能判断出日期的写成 YYYY-MM-DD。`;
  return aiJson(system, raw);
}

/** 根据一句话描述生成 deskboard.widget/v1 */
export function aiMakeWidget(desc: string) {
  const system = `${specSection("二")}

你是「桌面看板」的小组件设计助手。按上面的 deskboard.widget/v1 规范，根据用户描述写出一个小组件 JSON。
要求：只使用真实存在、无需登录的公开接口或 RSS（优先用你确定可用的地址）；只输出 JSON，不要解释。`;
  return aiJson(system, desc);
}
