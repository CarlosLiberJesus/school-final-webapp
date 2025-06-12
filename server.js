import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";

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

export const MOODLE_AGENT = process.env.MOODLE_AGENT;
if (!MOODLE_AGENT) {
  console.error("Path para agente, MOODLE_AGENT não definido em .env");
}

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

    // Armazenar informações do utilizador e token do Moodle na sessão
    req.session.user = authResult.user; // Contém id, username, fullname
    req.session.userToken = authResult.token; // Token Moodle específico do utilizador

    console.log(
      `Utilizador ${authResult.user.username} (ID: ${authResult.user.id}) autenticado com sucesso.`
    );
    res.json({
      success: true,
      user: authResult.user, // Enviar dados do utilizador para o frontend
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
      res.clearCookie("connect.sid"); // Nome padrão do cookie de sessão
      res.json({ success: true, message: "Sessão terminada com sucesso." });
    });
  } else {
    res.json({ success: true, message: "Nenhuma sessão ativa para terminar." });
  }
});

// Rota para verificar o estado da sessão (útil no carregamento da página)
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
    // Aqui, vamos obter o conteúdo completo, o frontend pode decidir como resumir a "estrutura"
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

// A sua função `formatCourseContentsForLLM` é muito boa, mantenho-a como está.
// Só vou referenciá-la aqui.
function formatCourseContentsForLLM(courseName, sections) {
  // (O seu código original de formatCourseContentsForLLM aqui...)
  // ... (copie a sua função de server.js original para aqui)
  // Exemplo simplificado para garantir que o server.js corre sem o seu código completo:
  if (!sections || sections.length === 0) {
    return `O curso "${courseName}" não parece ter conteúdos.`;
  }
  let output = `Conteúdo do Curso: "${courseName}"\n`;
  sections.forEach((section) => {
    output += `Secção: ${section.name}\n`;
    if (section.modules && section.modules.length > 0) {
      section.modules.forEach((module) => {
        output += `  - Módulo: ${module.name} (Tipo: ${module.modname})\n`;
      });
    } else {
      output += "  (Sem módulos nesta secção)\n";
    }
    output += "\n";
  });
  return output;
}

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
    return res.status(400).json({
      error: "Não estamos a preparar o Token do Moodle.",
    });
  }

  const userId = req.session.user.id;
  if (!userId) {
    return res.status(400).json({
      error: "Não estamos a preparar o userId do Moodle.",
    });
  }

  const chat_history = await getChatHistoryForAgent(userId, courseId);

  console.log(
    `[Agent Chat] Recebida pergunta sobre "${courseName}" (ID: ${courseId}): "${question}" e histórico "${chat_history}"`
  );

  try {
    const agentInput = {
      input: question, // A pergunta do utilizador
      chat_history: chat_history,
      moodle_course_id: courseId, // Opcional, pode ser inferido ou pedido pelo agente
      moodle_user_token: userToken, // ESSENCIAL para chamadas personalizadas ao Moodle
    };

    // 3. Chamar o seu Agente (que está a correr como um serviço HTTP)
    // Supondo que o seu agente LangChain está a correr noutra porta/serviço
    // e tem um endpoint como http://localhost:AGENT_PORT/invoke
    console.log(`[WebApp] A enviar pedido para o Agente LangChain...`);

    // const agentServiceUrl = "http://localhost:3001/invoke-agent"; // Exemplo de URL do serviço do agente
    // const agentResponse = await axios.post(agentServiceUrl, agentInput);
    // const agentAnswer = agentResponse.data.output; // Ou a estrutura que o seu agente retornar

    // **PARA AGORA, SE O AGENTE ESTIVER NO MESMO PROCESSO NODE.JS (como no seu index.js):**
    const module = await import(MOODLE_AGENT);
    const { invokeAgent } = module;
    const agentResult = await invokeAgent(agentInput); // Esta função interna chamaria agentExecutor.invoke
    const agentAnswer = agentResult.output;

    await addToHistory(userId, courseId, question, agentAnswer); // Sua função de histórico

    res.json({ answer: agentAnswer });
  } catch (error) {
    console.error("[Agent Chat] Erro detalhado:", error);
    // A sua gestão de erros para o Gemini era boa, pode adaptá-la aqui.
    res.status(500).json({
      error: "Ocorreu um erro ao processar a sua pergunta com o assistente.",
    });
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
});
