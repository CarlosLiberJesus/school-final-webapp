// src/auth-client.js
import axios from "axios";
import https from "node:https";

const MOODLE_URL = process.env.MOODLE_URL;
// const MOODLE_TOKEN = process.env.MOODLE_TOKEN; // Token administrativo - não usado aqui diretamente para login

// Função para autenticar usuário no Moodle
async function authenticateUser(username, password) {
  try {
    // Endpoint de autenticação do Moodle
    const loginUrl = MOODLE_URL.replace(
      "/webservice/rest/server.php",
      "/login/token.php"
    );

    const params = new URLSearchParams({
      username: username,
      password: password,
      service: "moodle_mobile_app", // Serviço padrão do Moodle para apps
    });

    console.log(
      `Tentando autenticar no Moodle: ${loginUrl} com utilizador ${username}`
    );
    const response = await axios.get(`${loginUrl}?${params.toString()}`, {
      httpsAgent: new https.Agent({
        rejectUnauthorized: process.env.NODE_ENV === "production", // Mais seguro
      }),
    });

    if (response.data.error) {
      console.error(
        "Erro do Moodle na autenticação:",
        response.data.error,
        response.data.errorcode,
        response.data.debuginfo
      );
      throw new Error(response.data.error);
    }

    if (!response.data.token) {
      console.error("Token não recebido do Moodle após tentativa de login.");
      throw new Error("Token não recebido do Moodle");
    }

    // Obter informações do usuário com o token recebido
    const userInfo = await getUserInfo(response.data.token, MOODLE_URL); // Passar MOODLE_URL

    return {
      token: response.data.token, // Token específico do utilizador
      user: userInfo, // Informações do utilizador
    };
  } catch (error) {
    // Log mais detalhado do erro da axios
    if (error.response) {
      console.error(
        "Erro Axios na autenticação (response):",
        error.response.data,
        error.response.status,
        error.response.headers
      );
    } else if (error.request) {
      console.error("Erro Axios na autenticação (request):", error.request);
    } else {
      console.error(
        "Erro na configuração da autenticação ou outro:",
        error.message
      );
    }
    console.error("Stack do erro na autenticação:", error.stack);
    // Re-throw o erro original se for um erro específico do Moodle, caso contrário, um erro mais genérico.
    throw error.message.includes("Moodle")
      ? error
      : new Error("Falha na autenticação com o Moodle.");
  }
}

// Obter informações do usuário usando o token específico do utilizador
async function getUserInfo(userToken, moodleBaseUrl) {
  // Adicionado moodleBaseUrl
  const params = new URLSearchParams({
    wstoken: userToken,
    wsfunction: "core_webservice_get_site_info", // Esta função retorna info do site e do utilizador do token
    moodlewsrestformat: "json",
  });

  try {
    const response = await axios.get(`${moodleBaseUrl}?${params.toString()}`, {
      // Usar moodleBaseUrl
      httpsAgent: new https.Agent({
        rejectUnauthorized: process.env.NODE_ENV === "production", // Mais seguro
      }),
    });

    if (response.data.errorcode) {
      console.error(
        "Erro do Moodle ao obter info do utilizador:",
        response.data.message,
        response.data.errorcode
      );
      throw new Error(
        response.data.message ||
          "Erro ao obter informações do utilizador do Moodle"
      );
    }

    return {
      id: response.data.userid,
      username: response.data.username,
      fullname: response.data.fullname,
      // A função core_webservice_get_site_info não retorna 'userrolenames' diretamente
      // Para papéis, seria necessário outra chamada, ex: core_user_get_users_by_field com o userid
      // Ou, se o objetivo for papéis num contexto específico (curso), outras funções seriam mais adequadas.
      // Por agora, vamos omitir roles ou deixar como array vazio.
      roles: response.data.userissiteadmin ? ["admin"] : [], // Simplificação: verificar se é admin do site
    };
  } catch (error) {
    if (error.response) {
      console.error(
        "Erro Axios ao obter info do utilizador (response):",
        error.response.data,
        error.response.status
      );
    } else if (error.request) {
      console.error(
        "Erro Axios ao obter info do utilizador (request):",
        error.request
      );
    } else {
      console.error("Erro ao obter informações do utilizador:", error.message);
    }
    throw new Error("Falha ao obter informações do utilizador do Moodle.");
  }
}

// Verificar se o usuário tem permissão para acessar um curso específico (placeholder)
async function checkCourseAccess(token, courseId) {
  // Implementar verificação de acesso ao curso
  // Pode usar core_enrol_get_enrolled_users ou outro endpoint apropriado
  return true; // Placeholder
}

export { authenticateUser, getUserInfo, checkCourseAccess };
