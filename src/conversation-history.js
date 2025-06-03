import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
// import { askGemini } from "./gemini-client.js"; // Gemini para resumir @deprecated
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_DIR = path.join(__dirname, "..", "data", "conversations");
const MAX_RAW_HISTORY_ENTRIES = 50; // Total de entradas brutas antes de pensar em resumir
const HISTORY_SUMMARY_THRESHOLD = 40; // Quantidade de entradas para acionar o resumo
const ENTRIES_TO_SUMMARIZE = 30; // Quantas das mais antigas resumir
const MAX_CONTEXT_HISTORY_ENTRIES = 5; // Quantas interações recentes (brutas ou resumo) para o prompt

// Garantir que o diretório existe
async function ensureDirectoryExists() {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
  } catch (error) {
    console.error("Erro ao criar diretório de histórico:", error);
  }
}

// Obter o caminho do arquivo de histórico para um curso específico
function getHistoryFilePath(userId, courseId) {
  return path.join(
    HISTORY_DIR,
    `course_${courseId}_user_${userId}_history.json`
  );
}

async function getHistory(userId, courseId) {
  // ... (sem grandes alterações, talvez logar se o ficheiro não existe)
  await ensureDirectoryExists();
  const historyFilePath = getHistoryFilePath(userId, courseId);
  try {
    const data = await fs.readFile(historyFilePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    console.error(
      `Erro ao ler histórico do curso ${courseId} para user ${userId}:`,
      error
    );
    return [];
  }
}

async function saveHistory(userId, courseId, history) {
  await ensureDirectoryExists();
  const historyFilePath = getHistoryFilePath(userId, courseId);
  try {
    await fs.writeFile(
      historyFilePath,
      JSON.stringify(history, null, 2),
      "utf8"
    );
    console.log(
      `Histórico salvo para o curso ${courseId} (${history.length} entradas totais)`
    );
  } catch (error) {
    console.error(`Erro ao salvar histórico do curso ${courseId}:`, error);
  }
}

async function addToHistory(userId, courseId, question, answer) {
  let history = await getHistory(userId, courseId);
  const timestamp = new Date().toISOString();
  history.push({ type: "interaction", timestamp, question, answer });
  // ...restante lógica igual, mas usando userId e courseId...
  await saveHistory(userId, courseId, history);
  return true;
}

const MAX_HISTORY_MESSAGES_FOR_AGENT = 10; // 5 interações (pergunta+resposta)
// Dá o resultado em /core/messages
async function getChatHistoryForAgent(userId, courseId) {
  const rawInteractions = await getRawStoredHistory(
    userId,
    courseId,
    MAX_HISTORY_MESSAGES_FOR_AGENT / 2
  );
  if (!rawInteractions || rawInteractions.length === 0) {
    return [];
  }
  const messages = [];
  for (const interaction of rawInteractions) {
    messages.push(new HumanMessage(interaction.question));
    messages.push(new AIMessage(interaction.answer));
  }
  return messages;
}

async function getRawStoredHistory(userId, courseId, maxInteractions = 5) {
  const history = await getHistory(userId, courseId);
  // Filtra apenas interações (não resumos)
  const interactions = history.filter((item) => item.type === "interaction");
  // Devolve as últimas N interações
  return interactions.slice(-maxInteractions);
}

export {
  addToHistory,
  getHistory,
  formatHistoryForLLM,
  getChatHistoryForAgent,
}; // getHistory pode ser útil para debug

/** DEPRECATED */
// Daria o resultado em texto corrido, agora envia "@langchain/core/messages";
async function formatHistoryForLLM(userId, courseId) {
  const history = await getHistory(userId, courseId);
  if (history.length === 0) {
    return "Não há histórico de conversas anteriores para este curso.";
  }

  let output = "Contexto de Conversas Anteriores (mais recentes primeiro):\n\n";
  let entriesForContext = 0;

  // Itera do fim para o início para pegar os mais recentes
  for (
    let i = history.length - 1;
    i >= 0 && entriesForContext < MAX_CONTEXT_HISTORY_ENTRIES;
    i--
  ) {
    const item = history[i];
    const date = new Date(item.timestamp).toLocaleDateString(); // Mais curto para o prompt

    if (item.type === "interaction") {
      output += `Em ${date}, o Professor perguntou: "${item.question}"\n`;
      output += `Assistente respondeu: "${item.answer}"\n\n`;
    } else if (item.type === "summary") {
      output += `Em ${date}, um resumo de ${item.summarized_count} interações anteriores indicou:\n"${item.summary}"\n\n`;
    }
    entriesForContext++;
  }
  if (entriesForContext === 0)
    return "Não há histórico de conversas anteriores para este curso.";
  return output;
}

//ideia de encortar ficheiros de logs, por fazer resumos paralelos
async function summarizeOldInteractions(courseId, interactionsToSummarize) {
  if (!interactionsToSummarize || interactionsToSummarize.length === 0) {
    return "Nenhuma interação antiga para resumir.";
  }

  let textToSummarize =
    "Resuma os pontos chave das seguintes interações de uma conversa entre um Professor e um Assistente de IA sobre um curso Moodle:\n\n";
  interactionsToSummarize.forEach((interaction, index) => {
    textToSummarize += `Interação ${index + 1}:\n`;
    textToSummarize += `P: ${interaction.question}\n`;
    textToSummarize += `R: ${interaction.answer}\n\n`;
  });

  const summaryPrompt = `
Você é um modelo de linguagem com a tarefa de resumir conversas.
A seguir está uma série de interações entre um Professor e um Assistente de IA.
Por favor, crie um resumo conciso dos principais tópicos discutidos, decisões tomadas ou informações importantes trocadas.
O objetivo é manter a essência da conversa para referência futura, sem todos os detalhes.

Conversa para resumir:
---
${textToSummarize}
---

Resumo conciso:`;

  try {
    console.log(
      `Solicitando resumo de ${interactionsToSummarize.length} interações para o curso ${courseId}`
    );
    const summary = await askGemini(summaryPrompt); // Chama o Gemini para resumir
    console.log(`Resumo recebido para o curso ${courseId}`);
    return summary;
  } catch (error) {
    console.error(`Erro ao resumir histórico para o curso ${courseId}:`, error);
    return "Erro ao gerar resumo do histórico."; // Retorna um placeholder em caso de erro
  }
}

async function addToHistoryDeprecated(courseId, question, answer) {
  let history = await getHistory(courseId);
  const timestamp = new Date().toISOString();

  history.push({ type: "interaction", timestamp, question, answer });

  if (history.length > HISTORY_SUMMARY_THRESHOLD) {
    // Filtra apenas interações, pois os resumos não devem ser resumidos novamente
    const actualInteractions = history.filter(
      (item) => item.type === "interaction"
    );

    if (actualInteractions.length >= HISTORY_SUMMARY_THRESHOLD) {
      const interactionsToSummarize = actualInteractions.slice(
        0,
        ENTRIES_TO_SUMMARIZE
      );
      const remainingInteractions =
        actualInteractions.slice(ENTRIES_TO_SUMMARIZE);

      // Obter resumos anteriores, se houver
      const previousSummaries = history.filter(
        (item) => item.type === "summary"
      );

      if (interactionsToSummarize.length > 0) {
        const summaryText = await summarizeOldInteractions(
          courseId,
          interactionsToSummarize
        );
        const summaryEntry = {
          type: "summary",
          timestamp: new Date().toISOString(),
          summary: summaryText,
          summarized_count: interactionsToSummarize.length,
        };
        // Coloca o novo resumo no início (ou antes das interações restantes)
        // e mantém os resumos anteriores
        history = [
          ...previousSummaries,
          summaryEntry,
          ...remainingInteractions,
        ];
        console.log(
          `Resumo de ${interactionsToSummarize.length} interações adicionado ao histórico do curso ${courseId}.`
        );
      }
    }
  }

  // Limitar o número total de entradas (resumos + interações) no ficheiro
  if (history.length > MAX_RAW_HISTORY_ENTRIES) {
    // Prioriza manter resumos e interações mais recentes
    const summaries = history.filter((item) => item.type === "summary");
    const interactions = history.filter((item) => item.type === "interaction");

    const excess = history.length - MAX_RAW_HISTORY_ENTRIES;
    let interactionsToRemove = Math.min(excess, interactions.length);
    let summariesToRemove = Math.min(
      excess - interactionsToRemove,
      summaries.length
    );

    const keptInteractions = interactions.slice(interactionsToRemove);
    const keptSummaries = summaries.slice(summariesToRemove);

    history = [...keptSummaries, ...keptInteractions].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
  }

  await saveHistory(courseId, history);
  return true;
}
