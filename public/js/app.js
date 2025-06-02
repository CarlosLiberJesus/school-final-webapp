document.addEventListener("DOMContentLoaded", () => {
  // Elementos Globais
  const loginSection = document.getElementById("loginSection");
  const appSection = document.getElementById("appSection");
  const loginButton = document.getElementById("loginButton");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginError = document.getElementById("loginError");
  const logoutButton = document.getElementById("logoutButton");
  const userFullnameSpan = document.getElementById("userFullname");

  const coursesListDiv = document.getElementById("coursesList");
  const courseDetailPanel = document.getElementById("courseDetailPanel"); // O contentor do acordeão
  const selectedCourseNameP = document.getElementById("selectedCourseName"); // Título dentro do painel
  const courseContentsDiv = document.getElementById("courseContentsDiv"); // Div para o conteúdo real

  const chatMessagesDiv = document.getElementById("chatMessages");
  const userQuestionInput = document.getElementById("userQuestionInput");
  const sendQuestionBtn = document.getElementById("sendQuestionBtn");

  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".sidebar");
  const accordionHeaders = document.querySelectorAll(".accordion-header");
  const accordionItems = document.querySelectorAll(".accordion-item");

  let currentSelectedCourse = null; // { id: null, name: null }

  // --- Funções Utilitárias ---
  function showSpinner(element, message = "A carregar...") {
    element.innerHTML = `<div class="spinner"></div> ${message}`;
  }

  function displayError(element, message) {
    element.innerHTML = `<p class="placeholder-text error-text">${message}</p>`;
  }

  function addMessageToChat(htmlContent, sender) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add(
      "message",
      sender === "user" ? "user-message" : "bot-message"
    );
    // Se for do bot, renderizar markdown, senão, texto simples (ou HTML se já vier formatado)
    messageDiv.innerHTML =
      sender === "bot" ? marked.parse(htmlContent) : htmlContent;
    chatMessagesDiv.appendChild(messageDiv);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    return messageDiv;
  }

  // --- Controlo da UI (Sidebar, Accordion) ---
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      localStorage.setItem(
        "sidebarCollapsed",
        sidebar.classList.contains("collapsed")
      );
    });
    if (localStorage.getItem("sidebarCollapsed") === "true") {
      sidebar.classList.add("collapsed");
    }
  }

  accordionHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const targetId = header.getAttribute("data-target");
      const targetContent = document.getElementById(targetId);
      const parentItem = header.closest(".accordion-item");

      // Fecha todos os outros itens se não for o comportamento desejado de múltiplos abertos
      // accordionItems.forEach(item => {
      //     if (item !== parentItem) {
      //         item.classList.remove('active');
      //         item.querySelector('.accordion-content').classList.remove('show');
      //     }
      // });

      parentItem.classList.toggle("active");
      targetContent.classList.toggle("show");
    });
  });

  // --- Autenticação ---
  async function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      loginError.textContent = "Por favor, preencha o utilizador e a senha.";
      return;
    }
    loginError.textContent = "";
    loginButton.disabled = true;
    loginButton.innerHTML = '<span class="spinner"></span> A entrar...';

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        initializeUser(data.user);
      } else {
        loginError.textContent = data.error || "Falha no login.";
      }
    } catch (error) {
      console.error("Erro de rede ou fetch no login:", error);
      loginError.textContent = "Erro de comunicação ao tentar fazer login.";
    } finally {
      loginButton.disabled = false;
      loginButton.innerHTML = "Entrar";
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch (error) {
      console.error("Erro ao fazer logout no servidor:", error);
    } finally {
      // Limpar estado do frontend e mostrar ecrã de login
      currentSelectedCourse = null;
      userFullnameSpan.textContent = "";
      appSection.style.display = "none";
      loginSection.style.display = "flex";
      chatMessagesDiv.innerHTML = "";
      coursesListDiv.innerHTML =
        '<p class="placeholder-text">Faça login para ver as suas disciplinas.</p>';
      courseContentsDiv.innerHTML =
        '<p class="placeholder-text">Selecione uma disciplina.</p>';
      selectedCourseNameP.textContent = "";
      disableChat("Faça login e selecione uma disciplina.");
      usernameInput.value = ""; // Limpar campos de login
      passwordInput.value = "";
    }
  }

  async function checkSession() {
    try {
      const response = await fetch("/api/session-status");
      const data = await response.json();
      if (response.ok && data.loggedIn) {
        initializeUser(data.user);
      } else {
        loginSection.style.display = "flex";
        appSection.style.display = "none";
        addMessageToChat(
          "Bem-vindo! Por favor, faça login para começar.",
          "bot"
        );
      }
    } catch (error) {
      console.error("Erro ao verificar sessão:", error);
      loginSection.style.display = "flex";
      appSection.style.display = "none";
      addMessageToChat(
        "Erro ao ligar ao servidor. Tente recarregar a página.",
        "bot"
      );
    }
  }

  function initializeUser(userData) {
    loginSection.style.display = "none";
    appSection.style.display = "flex";
    userFullnameSpan.textContent = userData.fullname || userData.username;

    addMessageToChat(
      `Olá ${userData.fullname}! As suas disciplinas estão a ser carregadas...`,
      "bot"
    );
    loadUserCourses();
    disableChat("Selecione uma disciplina para começar a interagir.");

    // Abrir o acordeão de disciplinas por defeito
    const coursesAccordion = document.getElementById("coursesAccordionItem");
    const coursesContent = document.getElementById("coursesList");
    if (coursesAccordion && !coursesAccordion.classList.contains("active")) {
      coursesAccordion.classList.add("active");
      coursesContent.classList.add("show");
    }
  }

  // --- Disciplinas e Conteúdo ---
  async function loadUserCourses() {
    showSpinner(coursesListDiv, "A carregar disciplinas...");
    try {
      const response = await fetch("/api/my-courses");
      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ error: `Erro HTTP: ${response.status}` }));
        throw new Error(
          errData.error ||
            `Erro HTTP ${response.status} ao carregar disciplinas.`
        );
      }
      const courses = await response.json();
      displayCourses(courses);
      if (courses && courses.length > 0) {
        addMessageToChat(
          "Disciplinas carregadas. Por favor, **selecione uma disciplina** da lista para ver os detalhes e ativar o chat.",
          "bot"
        );
      } else {
        addMessageToChat(
          "Não foram encontradas disciplinas para si no Moodle.",
          "bot"
        );
      }
    } catch (error) {
      console.error("Erro ao carregar disciplinas:", error);
      displayError(coursesListDiv, `Erro: ${error.message}`);
      addMessageToChat(
        `**Erro ao carregar as suas disciplinas:** ${error.message}`,
        "bot"
      );
    }
  }

  function displayCourses(courses) {
    coursesListDiv.innerHTML = "";
    if (!courses || courses.length === 0) {
      coursesListDiv.innerHTML =
        '<p class="placeholder-text">Nenhuma disciplina encontrada.</p>';
      return;
    }
    courses.forEach((course) => {
      const courseDiv = document.createElement("div");
      courseDiv.classList.add("course-item");
      courseDiv.textContent = course.fullname || course.displayname; // Moodle usa ambos
      courseDiv.dataset.courseId = course.id;
      courseDiv.dataset.courseName = course.fullname || course.displayname;
      courseDiv.addEventListener("click", () => handleCourseSelection(course));
      coursesListDiv.appendChild(courseDiv);
    });
  }

  async function handleCourseSelection(course) {
    const courseId = course.id;
    const courseName = course.fullname || course.displayname;

    if (currentSelectedCourse && currentSelectedCourse.id === courseId) return; // Já selecionado

    document
      .querySelectorAll(".course-item.selected")
      .forEach((el) => el.classList.remove("selected"));
    const courseDivElement = coursesListDiv.querySelector(
      `[data-course-id="${courseId}"]`
    );
    if (courseDivElement) courseDivElement.classList.add("selected");

    currentSelectedCourse = { id: courseId, name: courseName };

    selectedCourseNameP.textContent = courseName;
    showSpinner(courseContentsDiv, `A carregar detalhes de "${courseName}"...`);

    // Abrir o acordeão de detalhes da disciplina
    const detailAccordion = document.getElementById(
      "courseDetailAccordionItem"
    );
    const detailContent = document.getElementById("courseDetailPanel");
    if (detailAccordion && !detailAccordion.classList.contains("active")) {
      detailAccordion.classList.add("active");
      detailContent.classList.add("show");
    }

    try {
      const response = await fetch(`/api/course-summary/${courseId}`);
      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ error: `Erro HTTP: ${response.status}` }));
        throw new Error(
          errData.error || `Erro HTTP ${response.status} ao carregar conteúdo.`
        );
      }
      const contents = await response.json();
      displayCourseSummary(contents); // Exibe o resumo da estrutura
      enableChat(courseName);
    } catch (error) {
      console.error("Erro ao carregar resumo da disciplina:", error);
      displayError(
        courseContentsDiv,
        `Erro ao carregar detalhes: ${error.message}`
      );
      disableChat(
        "Erro ao carregar dados da disciplina. Tente selecionar outra."
      );
    }
  }

  function displayCourseSummary(sections) {
    // Renomeado para 'sections' para clareza
    courseContentsDiv.innerHTML = "";
    if (!sections || sections.length === 0) {
      courseContentsDiv.innerHTML =
        '<p class="placeholder-text">Esta disciplina não tem conteúdos visíveis ou estrutura definida.</p>';
      return;
    }

    sections.forEach((section) => {
      if (!section.visible && section.visible === 0) return; // Ignorar seções invisíveis para o resumo

      const sectionP = document.createElement("p");
      sectionP.innerHTML = `<strong class="section-title">${section.name}</strong>`;
      courseContentsDiv.appendChild(sectionP);

      if (section.modules && section.modules.length > 0) {
        const ul = document.createElement("ul");
        section.modules.forEach((module) => {
          if (!module.visible && module.visible === 0) return; // Ignorar módulos invisíveis
          if (
            module.modplural === "Separadores" ||
            (module.modname === "label" && module.name.trim() === "...")
          ) {
            return; // Ignorar separadores ou labels vazios no resumo
          }

          const li = document.createElement("li");
          li.classList.add("module-item");

          const typeLabel = document.createElement("span");
          typeLabel.classList.add("module-type-label");
          let moduleTypeName =
            module.modname.charAt(0).toUpperCase() + module.modname.slice(1);

          switch (module.modname) {
            case "quiz":
              typeLabel.classList.add("type-quiz");
              moduleTypeName = "Questionário";
              break;
            case "folder":
              typeLabel.classList.add("type-folder");
              moduleTypeName = "Pasta";
              break;
            case "url":
              typeLabel.classList.add("type-url");
              moduleTypeName = "Link Externo";
              break;
            case "resource":
              typeLabel.classList.add("type-resource");
              moduleTypeName = "Ficheiro";
              break;
            case "book":
              typeLabel.classList.add("type-book");
              moduleTypeName = "Livro";
              break;
            case "page":
              typeLabel.classList.add("type-page");
              moduleTypeName = "Página";
              break;
            case "assign":
              typeLabel.classList.add("type-assign");
              moduleTypeName = "Tarefa";
              break;
            case "forum":
              typeLabel.classList.add("type-forum");
              moduleTypeName = "Fórum";
              break;
            default:
              typeLabel.classList.add("type-default");
          }
          typeLabel.textContent = moduleTypeName;
          li.appendChild(typeLabel);

          const nameSpan = document.createElement("span");
          nameSpan.classList.add("module-name");
          nameSpan.textContent = ` ${module.name}`; // Espaço para separar do label
          li.appendChild(nameSpan);
          ul.appendChild(li);
        });
        if (ul.children.length > 0) {
          courseContentsDiv.appendChild(ul);
        } else {
          const noModulesP = document.createElement("p");
          noModulesP.classList.add("module-item", "placeholder-text");
          noModulesP.textContent = "Nenhum módulo visível nesta secção.";
          courseContentsDiv.appendChild(noModulesP);
        }
      } else {
        const noModulesP = document.createElement("p");
        noModulesP.classList.add("module-item", "placeholder-text");
        noModulesP.textContent = "Nenhum módulo nesta secção.";
        courseContentsDiv.appendChild(noModulesP);
      }
    });
  }

  // --- Chat ---
  function enableChat(courseName) {
    userQuestionInput.disabled = false;
    sendQuestionBtn.disabled = false;
    userQuestionInput.placeholder = `Pergunte sobre "${courseName}"...`;
    addMessageToChat(
      `Agora pode perguntar sobre a disciplina: **${courseName}**.`,
      "bot"
    );
  }

  function disableChat(
    message = "Selecione uma disciplina para ativar o chat."
  ) {
    userQuestionInput.disabled = true;
    sendQuestionBtn.disabled = true;
    userQuestionInput.placeholder = message;
    // Não limpar currentSelectedCourse aqui, pois pode ser útil para outras partes da UI
  }

  async function handleSendQuestion() {
    const question = userQuestionInput.value.trim();
    if (!question || !currentSelectedCourse) {
      addMessageToChat(
        "Por favor, escreva uma pergunta e certifique-se que uma disciplina está selecionada.",
        "bot"
      );
      return;
    }

    addMessageToChat(question, "user"); // Mostra a pergunta do utilizador
    userQuestionInput.value = "";
    sendQuestionBtn.disabled = true; // Desabilitar enquanto processa
    const thinkingMsg = addMessageToChat(
      '<span class="spinner"></span> O assistente está a pensar...',
      "bot"
    );

    try {
      const response = await fetch("/api/agent/chat", {
        // Rota atualizada
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question,
          courseId: currentSelectedCourse.id,
          courseName: currentSelectedCourse.name,
        }),
      });

      if (thinkingMsg) chatMessagesDiv.removeChild(thinkingMsg); // Remover "a pensar"

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: `Erro HTTP: ${response.status}` }));
        throw new Error(
          errorData.error || `Erro ${response.status} do servidor.`
        );
      }

      const data = await response.json();
      addMessageToChat(data.answer, "bot");
    } catch (error) {
      console.error("Erro ao enviar pergunta:", error);
      if (thinkingMsg && thinkingMsg.parentNode === chatMessagesDiv) {
        chatMessagesDiv.removeChild(thinkingMsg);
      }
      addMessageToChat(
        `**Erro ao contactar o assistente:** ${error.message}`,
        "bot"
      );
    } finally {
      if (currentSelectedCourse) sendQuestionBtn.disabled = false; // Reabilitar se ainda houver curso selecionado
    }
  }

  // --- Event Listeners ---
  if (loginButton) {
    loginButton.addEventListener("click", handleLogin);
    passwordInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleLogin();
    });
    usernameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleLogin();
    });
  }
  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
  }
  if (sendQuestionBtn) {
    sendQuestionBtn.addEventListener("click", handleSendQuestion);
    userQuestionInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendQuestion();
      }
    });
  }

  // --- Inicialização ---
  checkSession(); // Verifica se já existe uma sessão ao carregar a página
});
