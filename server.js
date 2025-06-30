import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import axios from "axios"; // Adicionado Axios

// Clientes Moodle e Autenticação
import { authenticateUser } from "./src/auth-client.js";
import { getUserCourses, getCourseContents } from "./src/moodle-client.js";

import {
  getChatHistoryForAgent,
  addToHistory,
} from "./src/conversation-history.js";

// --- Configuração Inicial ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// URL do serviço do agente LangChain
const LANGCHAIN_AGENT_URL =
  process.env.LANGCHAIN_AGENT_URL || "http://localhost:3010/invoke";

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "school-moodle-default-secret",
    resave: false,
    saveUninitialized: false, // Não criar sessão até algo ser armazenado
    cookie: {
      secure: process.env.NODE_ENV === "production", // Usar true em produção com HTTPS
      httpOnly: true, // Prevenir acesso via JS no cliente
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
    },
  })
);

// Middleware para verificar autenticação
function requireAuth(req, res, next) {
  if (req.session && req.session.user && req.session.userToken) {
    next();
  } else {
    res.status(401).json({ error: "Não autenticado. Por favor, faça login." });
  }
}

// --- Rotas de Autenticação ---
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Utilizador e senha são obrigatórios." });
    }

    const authResult = await authenticateUser(username, password);

    req.session.user = authResult.user;
    req.session.userToken = authResult.token;

    console.log(
      `Utilizador ${authResult.user.username} (ID: ${authResult.user.id}) autenticado com sucesso.`
    );
    res.json({
      success: true,
      user: authResult.user,
    });
  } catch (error) {
    console.error("Erro no endpoint /api/login:", error.message);
    res.status(401).json({
      error: error.message || "Credenciais inválidas ou erro no Moodle.",
    });
  }
});

app.post("/api/logout", (req, res) => {
  if (req.session) {
    const username = req.session.user
      ? req.session.user.username
      : "desconhecido";
    req.session.destroy((err) => {
      if (err) {
        console.error("Erro ao terminar sessão:", err);
        return res
          .status(500)
          .json({ error: "Não foi possível terminar a sessão." });
      }
      console.log(`Sessão terminada para o utilizador ${username}.`);
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Sessão terminada com sucesso." });
    });
  } else {
    res.json({ success: true, message: "Nenhuma sessão ativa para terminar." });
  }
});

app.get("/api/session-status", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// --- Rotas de Dados Moodle (Protegidas) ---
app.get("/api/my-courses", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const userToken = req.session.userToken;
    const courses = await getUserCourses(userId, userToken);
    res.json(courses);
  } catch (error) {
    console.error(
      `Erro ao obter cursos para o utilizador ${req.session.user.id}:`,
      error.message
    );
    res
      .status(500)
      .json({ error: "Falha ao carregar as suas disciplinas do Moodle." });
  }
});

app.get("/api/course-summary/:courseid", requireAuth, async (req, res) => {
  try {
    const courseId = parseInt(req.params.courseid, 10);
    const userToken = req.session.userToken;
    if (isNaN(courseId)) {
      return res.status(400).json({ error: "ID da disciplina inválido." });
    }
    const contents = await getCourseContents(courseId, userToken);
    res.json(contents);
  } catch (error) {
    console.error(
      `Erro ao obter conteúdo da disciplina ${req.params.courseid}:`,
      error.message
    );
    res
      .status(500)
      .json({ error: "Falha ao carregar o conteúdo da disciplina." });
  }
});

app.post("/api/agent/chat", requireAuth, async (req, res) => {
  const { question, courseId, courseName } = req.body;

  if (!question || !courseId || !courseName) {
    return res.status(400).json({
      error:
        "Pergunta, ID da disciplina e nome da disciplina são obrigatórios.",
    });
  }

  const userToken = req.session.userToken;
  if (!userToken) {
    // Esta verificação já é feita pelo requireAuth, mas mantida por segurança adicional
    return res.status(401).json({
      error: "Token de utilizador não encontrado. Por favor, faça login novamente.",
    });
  }

  const userId = req.session.user.id;
  if (!userId) {
     // Esta verificação já é feita pelo requireAuth, mas mantida por segurança adicional
    return res.status(401).json({
      error: "ID de utilizador não encontrado. Por favor, faça login novamente.",
    });
  }

  try {
    const chat_history = await getChatHistoryForAgent(userId, courseId);

    console.log(
      `[WebApp] Pergunta sobre "${courseName}" (ID: ${courseId}): "${question}"`
    );
    // console.log("[WebApp] Histórico para o agente:", JSON.stringify(chat_history, null, 2)); // Descomentar para debug detalhado do histórico

    const agentInput = {
      input: question,
      moodle_user_token: userToken,
      moodle_course_id: Number(courseId), // Garantir que é número
      chat_history: chat_history || [],
    };

    console.log(
      `[WebApp] A enviar pedido para o Agente LangChain em ${LANGCHAIN_AGENT_URL}`
    );

    const agentResponse = await axios.post(LANGCHAIN_AGENT_URL, agentInput, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000, // Timeout de 60 segundos
    });

    // A API do agente LangChain especificada retorna um JSON com a resposta.
    // Ex: { "output": "Resposta do agente", "outros_dados": ... }
    // Ou pode ser diretamente a string de output, dependendo da configuração do servidor do agente.
    // Vou assumir que a resposta está em agentResponse.data.output conforme o exemplo na descrição.
    const agentAnswer = agentResponse.data.output;

    if (typeof agentAnswer === "undefined") {
        console.error("[WebApp] Resposta do agente não continha a propriedade 'output'. Resposta completa:", agentResponse.data);
        throw new Error("Formato de resposta inesperado do serviço do agente.");
    }

    await addToHistory(userId, courseId, question, agentAnswer);

    res.json({ answer: agentAnswer });
  } catch (error) {
    console.error("[WebApp] Erro ao comunicar com o Agente LangChain ou ao processar a resposta:", error);
    let errorMessage = "Ocorreu um erro ao processar a sua pergunta com o assistente.";
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // O servidor do agente respondeu com um status de erro
        console.error("[WebApp] Erro do servidor do agente:", error.response.status, error.response.data);
        errorMessage = `Erro do serviço do agente: ${error.response.status} - ${error.response.data.error || error.message}`;
      } else if (error.request) {
        // A requisição foi feita mas não houve resposta (ex: timeout, serviço offline)
        console.error("[WebApp] Nenhuma resposta do servidor do agente:", error.request);
        errorMessage = "O serviço do assistente não está a responder. Tente mais tarde.";
      } else {
        // Erro ao configurar a requisição
        console.error("[WebApp] Erro de configuração da requisição Axios:", error.message);
        errorMessage = `Erro ao preparar comunicação com o assistente: ${error.message}`;
      }
    } else if (error instanceof Error) {
        errorMessage = error.message; // Usa a mensagem do erro específico se for um erro conhecido
    }
    res.status(500).json({ error: errorMessage });
  }
});

// --- Rota Principal (fallback para servir o index.html para Single Page Application) ---
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Iniciar Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor Escola LLM iniciado em http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "AVISO: rejectUnauthorized está provavelmente desativado para HTTPS em ambiente de não produção."
    );
  }
  console.log(`Agente LangChain esperado em: ${LANGCHAIN_AGENT_URL}`);
});
