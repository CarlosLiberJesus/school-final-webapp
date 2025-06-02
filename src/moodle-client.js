// src/moodle-client.js
import axios from "axios";
import https from "node:https";

const MOODLE_URL = process.env.MOODLE_URL;
const MOODLE_ADMIN_TOKEN = process.env.MOODLE_TOKEN; // Token administrativo

const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === "production", // Mais seguro
});

// Função genérica para chamadas à API Moodle
async function moodleAPIRequest(wsfunction, extraParams = {}) {
  const params = new URLSearchParams({
    wstoken: MOODLE_ADMIN_TOKEN, // Usar token administrativo para estas operações
    wsfunction: wsfunction,
    moodlewsrestformat: "json",
    ...extraParams,
  });

  try {
    console.log(
      `Moodle API Request: ${wsfunction} com params: ${params
        .toString()
        .replace(MOODLE_ADMIN_TOKEN, "REDACTED_TOKEN")}`
    );
    const response = await axios.get(`${MOODLE_URL}?${params.toString()}`, {
      httpsAgent,
    });

    if (response.data && (response.data.exception || response.data.errorcode)) {
      const errorData = response.data;
      console.error(
        `Erro Moodle na função ${wsfunction}:`,
        errorData.message || errorData.error,
        `(Código: ${errorData.errorcode})`,
        errorData.debuginfo
      );
      throw new Error(
        `Erro Moodle (${wsfunction}): ${errorData.message || errorData.error}`
      );
    }
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Erro Axios ao chamar ${wsfunction}:`, error.message);
      if (error.response) {
        console.error("Detalhes do erro Axios (response):", {
          status: error.response.status,
          data: error.response.data,
        });
      }
    } else {
      console.error(
        `Erro desconhecido ao chamar ${wsfunction}:`,
        error.message
      );
    }
    // Re-throw para que o chamador possa tratar
    throw new Error(
      `Falha na comunicação com o Moodle para a função ${wsfunction}.`
    );
  }
}

// Função para obter informações do site Moodle
async function getMoodleSiteInfo() {
  return moodleAPIRequest("core_webservice_get_site_info");
}

// Função para obter TODOS os cursos (geralmente usado por admin)
async function getAllCourses() {
  const data = await moodleAPIRequest("core_course_get_courses");
  if (!Array.isArray(data)) {
    console.error(
      "Resposta de core_course_get_courses não foi um array:",
      data
    );
    throw new Error("Resposta inesperada do Moodle ao buscar todos os cursos.");
  }
  return data;
}

// Função para obter cursos específicos do usuário
async function getUserCourses(userId) {
  console.log(`A obter cursos para o utilizador ID: ${userId}`);
  const data = await moodleAPIRequest("core_enrol_get_users_courses", {
    userid: userId,
  });
  if (!Array.isArray(data)) {
    console.warn(
      "Resposta de core_enrol_get_users_courses não foi um array para o utilizador:",
      userId,
      data
    );
    // Pode ser que o utilizador não esteja inscrito em nenhum curso, o que é válido.
    // Moodle pode retornar um objeto vazio ou um array vazio dependendo da versão/configuração.
    // Se for um objeto com erro, o moodleAPIRequest já deve ter tratado.
    // Se for um objeto vazio em vez de array vazio, normalizar.
    return [];
  }
  return data;
}

// Função para obter conteúdo de um curso
async function getCourseContents(courseId) {
  console.log(`Obtendo conteúdo do curso ID: ${courseId}`);
  const data = await moodleAPIRequest("core_course_get_contents", {
    courseid: courseId,
  });

  if (!Array.isArray(data)) {
    console.error("Resposta de core_course_get_contents não é um array:", data);
    throw new Error(
      "Resposta inesperada do Moodle ao buscar conteúdos do curso."
    );
  }

  console.log(`Conteúdo do curso ${courseId} obtido: ${data.length} seções`);

  // Processamento básico para garantir que 'modules' existe
  return data.map((section) => ({
    ...section,
    modules: section.modules || [],
  }));
}

export {
  getMoodleSiteInfo,
  getCourseContents,
  getAllCourses,
  getUserCourses,
  moodleAPIRequest,
};
